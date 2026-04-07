import { Hono } from "hono";
import semver from "semver";
import type { Env, PackageVersionRow, ReviewMessage } from "../types.js";
import {
	getPackageByName,
	getAllKnownVersions,
	getVersionByPackageAndVersion,
	upsertPackage,
	insertVersion,
} from "../db/queries.js";
import {
	fetchUpstreamMetadata,
	fetchUpstreamVersionMetadata,
	upstreamPackageUrl,
	rewriteTarballUrls,
} from "./upstream.js";
import { isTyposquat, getTyposquatOrigin } from "./blocklist.js";
import { processReviewInline } from "../review/consumer.js";

interface BlockRule {
	package_name: string;
	version_pattern: string;
}

async function getBlockRules(
	db: D1Database,
	packageName: string,
): Promise<BlockRule[]> {
	const result = await db
		.prepare(
			"SELECT package_name, version_pattern FROM block_rule WHERE package_name = ?",
		)
		.bind(packageName)
		.all<BlockRule>();
	return result.results;
}

async function getUserBlockRules(
	db: D1Database,
	customerId: string,
	packageName: string,
): Promise<BlockRule[]> {
	const result = await db
		.prepare(
			"SELECT package_name, version_pattern FROM user_block_rule WHERE customer_id = ? AND package_name = ?",
		)
		.bind(customerId, packageName)
		.all<BlockRule>();
	return result.results;
}

async function getUserMinDownloads(
	db: D1Database,
	customerId: string,
): Promise<number | null> {
	const row = await db
		.prepare("SELECT min_weekly_downloads FROM user_settings WHERE id = ?")
		.bind(customerId)
		.first<{ min_weekly_downloads: number | null }>();
	return row?.min_weekly_downloads ?? null;
}

function isVersionBlocked(version: string, rules: BlockRule[]): boolean {
	for (const rule of rules) {
		if (rule.version_pattern === "*") return true;
		if (
			semver.satisfies(version, rule.version_pattern, {
				includePrerelease: true,
			})
		) {
			return true;
		}
	}
	return false;
}

function applyBlockRules(upstream: any, rules: BlockRule[]): void {
	if (!upstream.versions || rules.length === 0) return;

	const blocked = new Set<string>();
	for (const ver of Object.keys(upstream.versions)) {
		if (isVersionBlocked(ver, rules)) {
			blocked.add(ver);
			delete upstream.versions[ver];
		}
	}

	if (blocked.size > 0 && upstream["dist-tags"]) {
		for (const [tag, ver] of Object.entries<string>(upstream["dist-tags"])) {
			if (blocked.has(ver)) {
				const fallback = Object.keys(upstream.versions).pop() ?? null;
				if (fallback) {
					upstream["dist-tags"][tag] = fallback;
				} else {
					delete upstream["dist-tags"][tag];
				}
			}
		}
	}
}

const MIN_WEEKLY_DOWNLOADS = 50_000;

function setNoStoreRegistryJsonHeaders(c: {
	header: (k: string, v: string) => void;
}) {
	c.header("Cache-Control", "private, no-store, must-revalidate");
	c.header("Pragma", "no-cache");
	c.header("Vary", "Authorization");
}

const app = new Hono<{ Bindings: Env }>();

app.get("/:scope/:name", handleMetadata);
app.get("/:name", handleMetadata);

async function handleMetadata(c: any) {
	const scope = c.req.param("scope");
	const name = c.req.param("name");
	const packageName = scope?.startsWith("@")
		? `${scope}/${name}`
		: scope || name;
	const customerId: string | undefined = c.get("customerId");

	setNoStoreRegistryJsonHeaders(c);

	if (isTyposquat(packageName)) {
		const original = getTyposquatOrigin(packageName);
		return c.json(
			{
				error: `${packageName} is blocked — known typosquat of "${original}"`,
			},
			403,
		);
	}

	// ── DB checks first — no upstream fetch ──────────────────────────────
	const [blockRules, tracked] = await Promise.all([
		getBlockRules(c.env.DB, packageName),
		getPackageByName(c.env.DB, packageName),
	]);

	let knownVersions: PackageVersionRow[] = [];
	let hasRejected = false;
	if (tracked) {
		knownVersions = await getAllKnownVersions(c.env.DB, tracked.id);
		hasRejected = knownVersions.some((v) => v.status === "rejected");
	}

	let userRules: BlockRule[] = [];
	let minDownloads: number | null = null;
	if (customerId) {
		[userRules, minDownloads] = await Promise.all([
			getUserBlockRules(c.env.DB, customerId, packageName),
			getUserMinDownloads(c.env.DB, customerId),
		]);
	}

	// minDownloads is a package-level gate — doesn't need the full packument
	if (minDownloads != null) {
		const downloads =
			tracked?.weekly_downloads ?? (await fetchWeeklyDownloads(packageName));
		if (downloads < minDownloads) {
			return c.json(
				{
					error: `${packageName} is blocked — below your minimum weekly downloads threshold (${downloads.toLocaleString()} < ${minDownloads.toLocaleString()})`,
				},
				403,
			);
		}
	}

	const needsVersionFiltering =
		blockRules.length > 0 || hasRejected || userRules.length > 0;

	// ── Fast path: nothing to filter → redirect to npm ───────────────────
	if (!needsVersionFiltering) {
		if (!tracked) {
			c.executionCtx.waitUntil(maybeAutoTrack(c.env, packageName));
		}
		return c.redirect(upstreamPackageUrl(c.env, packageName), 302);
	}

	// ── Slow path: fetch full packument, apply filters, return ───────────
	const upstream = await fetchUpstreamMetadata(c.env, packageName);
	if (!upstream) {
		return c.json({ error: "not found" }, 404);
	}

	applyBlockRules(upstream, blockRules);
	if (userRules.length > 0) {
		applyBlockRules(upstream, userRules);
	}

	if (!tracked) {
		c.executionCtx.waitUntil(maybeAutoTrack(c.env, packageName));
		const registryUrl = new URL(c.req.url).origin;
		return c.json(rewriteTarballUrls(upstream, registryUrl));
	}

	if (upstream.versions) {
		const statusByVersion = new Map(
			knownVersions.map((v) => [v.version, v.status]),
		);

		const blocked = new Set<string>();
		const toReview: { version: string; tarballSha: string }[] = [];

		for (const ver of Object.keys(upstream.versions)) {
			const status = statusByVersion.get(ver);
			if (status === "rejected") {
				blocked.add(ver);
				delete upstream.versions[ver];
			} else if (!status) {
				toReview.push({
					version: ver,
					tarballSha: upstream.versions[ver].dist?.shasum || "",
				});
			}
		}

		if (toReview.length > 0) {
			c.executionCtx.waitUntil(
				fastTrackReview(c.env, tracked.id, packageName, toReview),
			);
		}

		if (blocked.size > 0 && upstream["dist-tags"]) {
			for (const [tag, ver] of Object.entries<string>(upstream["dist-tags"])) {
				if (blocked.has(ver)) {
					const fallback = Object.keys(upstream.versions).pop() ?? null;
					if (fallback) {
						upstream["dist-tags"][tag] = fallback;
					} else {
						delete upstream["dist-tags"][tag];
					}
				}
			}
		}
	}

	const registryUrl = new URL(c.req.url).origin;
	return c.json(rewriteTarballUrls(upstream, registryUrl));
}

async function maybeAutoTrack(
	env: Env,
	packageName: string,
): Promise<void> {
	try {
		const downloads = await fetchWeeklyDownloads(packageName);
		if (downloads < MIN_WEEKLY_DOWNLOADS) return;

		const existing = await getPackageByName(env.DB, packageName);
		if (existing) return;

		const metadata = await fetchUpstreamMetadata(env, packageName);
		if (!metadata) return;

		const pkgId = crypto.randomUUID();
		const latest = metadata["dist-tags"]?.latest;

		await upsertPackage(env.DB, {
			id: pkgId,
			name: packageName,
			description: metadata.description,
			distTags: JSON.stringify(metadata["dist-tags"] || {}),
			latestKnown: latest,
			weeklyDownloads: downloads,
		});

		const allVersions = Object.entries<any>(metadata.versions || {});
		const recentVersions = allVersions.slice(-20);

		const batch = recentVersions.map(([ver, vData]) =>
			env.DB.prepare(
				`INSERT INTO package_version (id, package_id, version, tarball_sha, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?) ON CONFLICT(package_id, version) DO NOTHING`,
			).bind(
				crypto.randomUUID(),
				pkgId,
				ver,
				vData.dist?.shasum || "",
				Date.now(),
			),
		);

		if (batch.length > 0) {
			await env.DB.batch(batch);
		}

		console.log(
			`[auto-track] ${packageName} (${downloads.toLocaleString()} downloads/week, ${recentVersions.length} versions approved)`,
		);
	} catch (err) {
		console.error(`[auto-track] Failed for ${packageName}:`, err);
	}
}

async function fetchWeeklyDownloads(name: string): Promise<number> {
	try {
		const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`;
		const res = await fetch(url);
		if (!res.ok) return 0;
		const data: any = await res.json();
		return data.downloads || 0;
	} catch {
		return 0;
	}
}

async function fastTrackReview(
	env: Env,
	packageId: string,
	packageName: string,
	versions: { version: string; tarballSha: string }[],
) {
	for (const { version, tarballSha } of versions) {
		try {
			const versionId = crypto.randomUUID();
			await insertVersion(env.DB, {
				id: versionId,
				packageId,
				version,
				tarballSha,
				status: "pending",
			});

			const message: ReviewMessage = {
				packageVersionId: versionId,
				packageName,
				version,
			};

			if (env.REVIEW_QUEUE) {
				await env.REVIEW_QUEUE.send(message);
			} else {
				await processReviewInline(env, message);
			}

			console.log(`[fast-track] Queued review for ${packageName}@${version}`);
		} catch (err) {
			console.error(
				`[fast-track] Failed for ${packageName}@${version}:`,
				err,
			);
		}
	}
}

app.get("/:scope/:name/:version", handleVersionMetadata);
app.get("/:name/:version", handleVersionMetadata);

async function handleVersionMetadata(c: any) {
	const scope = c.req.param("scope");
	const name = c.req.param("name");
	const version = c.req.param("version");
	const packageName = scope?.startsWith("@")
		? `${scope}/${name}`
		: scope || name;
	const customerId: string | undefined = c.get("customerId");

	setNoStoreRegistryJsonHeaders(c);

	if (isTyposquat(packageName)) {
		const original = getTyposquatOrigin(packageName);
		return c.json(
			{
				error: `${packageName} is blocked — known typosquat of "${original}"`,
			},
			403,
		);
	}

	// ── DB checks first — no upstream fetch ──────────────────────────────
	const [blockRules, tracked] = await Promise.all([
		getBlockRules(c.env.DB, packageName),
		getPackageByName(c.env.DB, packageName),
	]);

	if (isVersionBlocked(version, blockRules)) {
		return c.json(
			{ error: `${packageName}@${version} is blocked by admin policy` },
			403,
		);
	}

	if (customerId) {
		const [userRules, minDownloads] = await Promise.all([
			getUserBlockRules(c.env.DB, customerId, packageName),
			getUserMinDownloads(c.env.DB, customerId),
		]);

		if (isVersionBlocked(version, userRules)) {
			return c.json(
				{
					error: `${packageName}@${version} is blocked by your block rules`,
				},
				403,
			);
		}

		if (minDownloads != null) {
			const downloads =
				tracked?.weekly_downloads ??
				(await fetchWeeklyDownloads(packageName));
			if (downloads < minDownloads) {
				return c.json(
					{
						error: `${packageName} is blocked — below your minimum weekly downloads threshold (${downloads.toLocaleString()} < ${minDownloads.toLocaleString()})`,
					},
					403,
				);
			}
		}
	}

	if (tracked) {
		const ver = await getVersionByPackageAndVersion(
			c.env.DB,
			tracked.id,
			version,
		);
		if (ver && ver.status === "rejected") {
			return c.json(
				{
					error: `${packageName}@${version} is rejected — not available for install`,
				},
				403,
			);
		}
		if (!ver) {
			c.executionCtx.waitUntil(
				fastTrackReview(c.env, tracked.id, packageName, [
					{ version, tarballSha: "" },
				]),
			);
		}
	}

	// ── Fetch only this version's data (tiny payload, fast) ──────────────
	const versionData = await fetchUpstreamVersionMetadata(
		c.env,
		packageName,
		version,
	);
	if (!versionData) {
		return c.json({ error: "not found" }, 404);
	}

	const registryUrl = new URL(c.req.url).origin;
	if (versionData.dist?.tarball) {
		const url = new URL(versionData.dist.tarball);
		const filename = url.pathname.split("/").pop();
		versionData.dist.tarball = `${registryUrl}/${packageName}/-/${filename}`;
	}

	return c.json(versionData);
}

export { app as metadataRouter };
