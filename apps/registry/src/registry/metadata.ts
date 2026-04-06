import { Hono } from "hono";
import semver from "semver";
import type { Env, ReviewMessage } from "../types.js";
import {
  getPackageByName,
  getAllKnownVersions,
  getVersionByPackageAndVersion,
  upsertPackage,
  insertVersion,
} from "../db/queries.js";
import {
  fetchUpstreamMetadata,
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
    .prepare("SELECT package_name, version_pattern FROM block_rule WHERE package_name = ?")
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
    .prepare("SELECT package_name, version_pattern FROM user_block_rule WHERE customer_id = ? AND package_name = ?")
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
    if (semver.satisfies(version, rule.version_pattern, { includePrerelease: true })) {
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

  if (isTyposquat(packageName)) {
    const original = getTyposquatOrigin(packageName);
    return c.json(
      { error: `${packageName} is blocked — known typosquat of "${original}"` },
      403,
    );
  }

  const [upstream, blockRules] = await Promise.all([
    fetchUpstreamMetadata(c.env, packageName),
    getBlockRules(c.env.DB, packageName),
  ]);
  if (!upstream) {
    return c.json({ error: "not found" }, 404);
  }

  applyBlockRules(upstream, blockRules);

  const tracked = await getPackageByName(c.env.DB, packageName);

  if (customerId) {
    const [userRules, minDownloads] = await Promise.all([
      getUserBlockRules(c.env.DB, customerId, packageName),
      getUserMinDownloads(c.env.DB, customerId),
    ]);
    applyBlockRules(upstream, userRules);

    if (minDownloads != null && upstream.versions && Object.keys(upstream.versions).length > 0) {
      const downloads = tracked?.weekly_downloads ?? await fetchWeeklyDownloads(packageName);
      if (downloads < minDownloads) {
        for (const ver of Object.keys(upstream.versions)) {
          delete upstream.versions[ver];
        }
        if (upstream["dist-tags"]) {
          for (const tag of Object.keys(upstream["dist-tags"])) {
            delete upstream["dist-tags"][tag];
          }
        }
      }
    }
  }

  if (!tracked) {
    c.executionCtx.waitUntil(
      maybeAutoTrack(c.env, packageName, upstream),
    );

    const registryUrl = c.env.REGISTRY_URL || new URL(c.req.url).origin;
    return c.json(rewriteTarballUrls(upstream, registryUrl));
  }

  const enforceAllowlist = (tracked.weekly_downloads ?? 0) >= MIN_WEEKLY_DOWNLOADS;

  if (upstream.versions && enforceAllowlist) {
    const knownVersions = await getAllKnownVersions(c.env.DB, tracked.id);
    const approvedVersions = new Set(
      knownVersions.filter((v) => v.status === "approved").map((v) => v.version),
    );
    const knownVersionSet = new Set(knownVersions.map((v) => v.version));

    const blocked = new Set<string>();
    const toReview: { version: string; tarballSha: string }[] = [];

    for (const ver of Object.keys(upstream.versions)) {
      if (!approvedVersions.has(ver)) {
        blocked.add(ver);
        if (!knownVersionSet.has(ver)) {
          toReview.push({
            version: ver,
            tarballSha: upstream.versions[ver].dist?.shasum || "",
          });
        }
        delete upstream.versions[ver];
      }
    }

    if (toReview.length > 0) {
      c.executionCtx.waitUntil(
        fastTrackReview(c.env, tracked.id, packageName, toReview),
      );
    }

    if (blocked.size > 0 && upstream["dist-tags"]) {
      for (const [tag, ver] of Object.entries<string>(
        upstream["dist-tags"],
      )) {
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

  const registryUrl = c.env.REGISTRY_URL || new URL(c.req.url).origin;
  const rewritten = rewriteTarballUrls(upstream, registryUrl);
  return c.json(rewritten);
}

async function maybeAutoTrack(
  env: Env,
  packageName: string,
  metadata: any,
): Promise<void> {
  try {
    const downloads = await fetchWeeklyDownloads(packageName);
    if (downloads < MIN_WEEKLY_DOWNLOADS) return;

    // Double-check it wasn't tracked between request start and now
    const existing = await getPackageByName(env.DB, packageName);
    if (existing) return;

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

    // Auto-approve last 20 versions via batch
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
      console.error(`[fast-track] Failed for ${packageName}@${version}:`, err);
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

  if (isTyposquat(packageName)) {
    const original = getTyposquatOrigin(packageName);
    return c.json(
      { error: `${packageName} is blocked — known typosquat of "${original}"` },
      403,
    );
  }

  const [upstream, blockRules] = await Promise.all([
    fetchUpstreamMetadata(c.env, packageName),
    getBlockRules(c.env.DB, packageName),
  ]);
  const versionData = upstream?.versions?.[version];
  if (!versionData) {
    return c.json({ error: "not found" }, 404);
  }

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
        { error: `${packageName}@${version} is blocked by your block rules` },
        403,
      );
    }

    if (minDownloads != null) {
      const tracked = await getPackageByName(c.env.DB, packageName);
      const downloads = tracked?.weekly_downloads ?? await fetchWeeklyDownloads(packageName);
      if (downloads < minDownloads) {
        return c.json(
          { error: `${packageName} is blocked — below your minimum weekly downloads threshold (${downloads.toLocaleString()} < ${minDownloads.toLocaleString()})` },
          403,
        );
      }
    }
  }

  const tracked = await getPackageByName(c.env.DB, packageName);
  if (tracked && (tracked.weekly_downloads ?? 0) >= MIN_WEEKLY_DOWNLOADS) {
    const ver = await getVersionByPackageAndVersion(
      c.env.DB,
      tracked.id,
      version,
    );
    if (!ver || ver.status !== "approved") {
      if (!ver) {
        c.executionCtx.waitUntil(
          fastTrackReview(c.env, tracked.id, packageName, [
            { version, tarballSha: versionData.dist?.shasum || "" },
          ]),
        );
      }
      return c.json(
        {
          error: `${packageName}@${version} is ${ver?.status ?? "unreviewed"} — not yet available`,
        },
        403,
      );
    }
  }

  return c.json(versionData);
}

export { app as metadataRouter };
