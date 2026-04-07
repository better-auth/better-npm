import {
	describe,
	it,
	expect,
	beforeAll,
	afterEach,
	vi,
} from "vitest";
import { env, exports } from "cloudflare:workers";
import {
	runMigrations,
	createPackage,
	createPackageVersion,
	createBlockRule,
	createCustomer,
	createToken,
	createUserBlockRule,
	makeNpmMetadata,
	mockUpstreamFetch,
} from "./helpers.js";
import { hashToken } from "../auth/middleware.js";

const BASE = "https://registry.test";

function workerFetch(path: string, init?: RequestInit) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, { ...init, redirect: "manual" }),
	);
}

function upstreamUrl(packageName: string) {
	return `https://registry.npmjs.org/${encodeURIComponent(packageName).replace("%40", "@")}`;
}

function upstreamVersionUrl(packageName: string, version: string) {
	return `${upstreamUrl(packageName)}/${version}`;
}

function downloadsUrl(packageName: string) {
	return `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName).replace("%40", "@")}`;
}

beforeAll(async () => {
	await runMigrations(env.DB);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("GET /:name (package metadata)", () => {
	it("redirects to npm for untracked packages (fast path)", async () => {
		mockUpstreamFetch(
			new Map([
				[downloadsUrl("lodash"), { status: 200, body: JSON.stringify({ downloads: 50_000 }) }],
			]),
		);

		const res = await workerFetch("/lodash");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe(upstreamUrl("lodash"));
	});

	it("returns 403 for typosquat packages", async () => {
		const res = await workerFetch("/aj");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("typosquat");
		expect(body.error).toContain("ajv");
	});

	it("redirects to npm for tracked packages with no rejected versions", async () => {
		mockUpstreamFetch(new Map());

		const pkgId = await createPackage(env.DB, {
			name: "tracked-no-reject",
			weeklyDownloads: 200_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.1.0",
			status: "pending",
		});

		const res = await workerFetch("/tracked-no-reject");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe(
			upstreamUrl("tracked-no-reject"),
		);
	});

	it("filters versions blocked by admin block rules (slow path)", async () => {
		const metadata = makeNpmMetadata("blocked-pkg", [
			"1.0.0",
			"2.0.0",
			"3.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[
					upstreamUrl("blocked-pkg"),
					{ status: 200, body: JSON.stringify(metadata) },
				],
				[
					downloadsUrl("blocked-pkg"),
					{ status: 200, body: JSON.stringify({ downloads: 1_000 }) },
				],
			]),
		);

		await createBlockRule(env.DB, {
			packageName: "blocked-pkg",
			versionPattern: ">=2.0.0",
		});

		const res = await workerFetch("/blocked-pkg");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.versions["1.0.0"]).toBeTruthy();
		expect(body.versions["2.0.0"]).toBeUndefined();
		expect(body.versions["3.0.0"]).toBeUndefined();
	});

	it("filters versions with wildcard block rules", async () => {
		const metadata = makeNpmMetadata("fully-blocked", ["1.0.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[
					upstreamUrl("fully-blocked"),
					{ status: 200, body: JSON.stringify(metadata) },
				],
				[
					downloadsUrl("fully-blocked"),
					{ status: 200, body: JSON.stringify({ downloads: 500 }) },
				],
			]),
		);

		await createBlockRule(env.DB, {
			packageName: "fully-blocked",
			versionPattern: "*",
		});

		const res = await workerFetch("/fully-blocked");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(Object.keys(body.versions || {})).toHaveLength(0);
	});

	it("only blocks rejected versions for tracked packages (slow path)", async () => {
		const metadata = makeNpmMetadata("tracked-pkg", [
			"1.0.0",
			"1.1.0",
			"2.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[
					upstreamUrl("tracked-pkg"),
					{ status: 200, body: JSON.stringify(metadata) },
				],
			]),
		);

		const pkgId = await createPackage(env.DB, {
			name: "tracked-pkg",
			weeklyDownloads: 200_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.1.0",
			status: "pending",
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "2.0.0",
			status: "rejected",
		});

		const res = await workerFetch("/tracked-pkg");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.versions["1.0.0"]).toBeTruthy();
		expect(body.versions["1.1.0"]).toBeTruthy();
		expect(body.versions["2.0.0"]).toBeUndefined();
	});

	it("passes through unknown versions and blocks only rejected", async () => {
		const metadata = makeNpmMetadata("tracked-mixed", [
			"1.0.0",
			"1.1.0",
			"2.0.0",
			"3.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[
					upstreamUrl("tracked-mixed"),
					{ status: 200, body: JSON.stringify(metadata) },
				],
			]),
		);

		const pkgId = await createPackage(env.DB, {
			name: "tracked-mixed",
			weeklyDownloads: 500_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.1.0",
			status: "rejected",
		});
		// 2.0.0 and 3.0.0 are NOT in the DB — unknown/unreviewed

		const res = await workerFetch("/tracked-mixed");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.versions["1.0.0"]).toBeTruthy();
		expect(body.versions["1.1.0"]).toBeUndefined();
		expect(body.versions["2.0.0"]).toBeTruthy();
		expect(body.versions["3.0.0"]).toBeTruthy();
	});

	it("redirects to npm for scoped packages (fast path)", async () => {
		mockUpstreamFetch(
			new Map([
				[downloadsUrl("@scope/lib"), { status: 200, body: JSON.stringify({ downloads: 2_000 }) }],
			]),
		);

		const res = await workerFetch("/@scope/lib");
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe(upstreamUrl("@scope/lib"));
	});
});

describe("GET /:scope/:name/:version (scoped version metadata)", () => {
	it("returns specific version data for scoped packages", async () => {
		const metadata = makeNpmMetadata("@test/ver-pkg", ["1.0.0", "2.0.0"]);
		const versionData = metadata.versions["2.0.0"];
		mockUpstreamFetch(
			new Map([
				[
					upstreamVersionUrl("@test/ver-pkg", "2.0.0"),
					{ status: 200, body: JSON.stringify(versionData) },
				],
			]),
		);

		const res = await workerFetch("/@test/ver-pkg/2.0.0");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.version).toBe("2.0.0");
		expect(body.name).toBe("@test/ver-pkg");
	});

	it("rewrites tarball URL to go through registry", async () => {
		const metadata = makeNpmMetadata("@test/tarball-rewrite", [
			"1.0.0",
		]);
		const versionData = metadata.versions["1.0.0"];
		mockUpstreamFetch(
			new Map([
				[
					upstreamVersionUrl("@test/tarball-rewrite", "1.0.0"),
					{ status: 200, body: JSON.stringify(versionData) },
				],
			]),
		);

		const res = await workerFetch("/@test/tarball-rewrite/1.0.0");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.dist.tarball).not.toContain("registry.npmjs.org");
		expect(body.dist.tarball).toContain(
			"/@test/tarball-rewrite/-/tarball-rewrite-1.0.0.tgz",
		);
	});

	it("returns 404 for nonexistent version", async () => {
		mockUpstreamFetch(
			new Map([
				[
					upstreamVersionUrl("@test/ver-pkg2", "9.9.9"),
					{ status: 404, body: JSON.stringify({ error: "not found" }) },
				],
			]),
		);

		const res = await workerFetch("/@test/ver-pkg2/9.9.9");
		expect(res.status).toBe(404);
	});

	it("returns 403 for typosquat packages", async () => {
		const res = await workerFetch("/angula/1.0.0");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("typosquat");
	});

	it("returns 403 for admin-blocked versions", async () => {
		await createBlockRule(env.DB, {
			packageName: "@test/block-ver",
			versionPattern: ">=2.0.0",
		});

		const res = await workerFetch("/@test/block-ver/2.0.0");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("blocked by admin policy");
	});

	it("allows pending versions without blocking install", async () => {
		const metadata = makeNpmMetadata("@test/tracked-ver", [
			"1.0.0",
			"2.0.0",
		]);
		const versionData = metadata.versions["2.0.0"];
		mockUpstreamFetch(
			new Map([
				[
					upstreamVersionUrl("@test/tracked-ver", "2.0.0"),
					{ status: 200, body: JSON.stringify(versionData) },
				],
			]),
		);

		const pkgId = await createPackage(env.DB, {
			name: "@test/tracked-ver",
			weeklyDownloads: 500_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "2.0.0",
			status: "pending",
		});

		const res = await workerFetch("/@test/tracked-ver/2.0.0");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.version).toBe("2.0.0");
	});

	it("returns 403 for rejected tracked versions", async () => {
		const pkgId = await createPackage(env.DB, {
			name: "@test/rejected-ver",
			weeklyDownloads: 500_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "2.0.0",
			status: "rejected",
		});

		const res = await workerFetch("/@test/rejected-ver/2.0.0");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("rejected");
	});

	it("passes through unreviewed versions and fast-tracks review", async () => {
		const metadata = makeNpmMetadata("@test/unreviewed-ver", [
			"1.0.0",
			"2.0.0",
		]);
		const versionData = metadata.versions["2.0.0"];
		mockUpstreamFetch(
			new Map([
				[
					upstreamVersionUrl("@test/unreviewed-ver", "2.0.0"),
					{ status: 200, body: JSON.stringify(versionData) },
				],
			]),
		);

		const pkgId = await createPackage(env.DB, {
			name: "@test/unreviewed-ver",
			weeklyDownloads: 500_000,
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});

		const res = await workerFetch("/@test/unreviewed-ver/2.0.0");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.version).toBe("2.0.0");
	});

	it("returns 403 for user-blocked versions when authenticated", async () => {
		const metadata = makeNpmMetadata("@test/user-block", [
			"1.0.0",
			"2.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[
					upstreamUrl("@test/user-block"),
					{ status: 200, body: JSON.stringify(metadata) },
				],
			]),
		);

		const rawToken = "ubv-token-" + crypto.randomUUID();
		const tokenHash = await hashToken(rawToken);
		const customerId = await createCustomer(env.DB, {
			email: `ubv-${crypto.randomUUID()}@test.com`,
			githubId: `gh-ubv-${crypto.randomUUID()}`,
		});
		await createToken(env.DB, { customerId, tokenHash });
		await createUserBlockRule(env.DB, {
			customerId,
			packageName: "@test/user-block",
			versionPattern: ">=2.0.0",
		});

		const res = await workerFetch("/@test/user-block/2.0.0", {
			headers: { Authorization: `Bearer ${rawToken}` },
		});
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("blocked by your block rules");
	});
});
