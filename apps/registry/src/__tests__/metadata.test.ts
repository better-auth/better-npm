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
	return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

/**
 * Build the URL that fetchUpstreamMetadata actually constructs,
 * so our mock matches what the worker really requests.
 */
function upstreamUrl(packageName: string) {
	return `https://registry.npmjs.org/${encodeURIComponent(packageName).replace("%40", "@")}`;
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
	it("returns upstream metadata with rewritten tarball URLs", async () => {
		const metadata = makeNpmMetadata("lodash", ["4.17.20", "4.17.21"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("lodash"), { status: 200, body: JSON.stringify(metadata) }],
				[downloadsUrl("lodash"), { status: 200, body: JSON.stringify({ downloads: 50_000 }) }],
			]),
		);

		const res = await workerFetch("/lodash");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.name).toBe("lodash");
		expect(body.versions["4.17.21"].dist.tarball).not.toContain(
			"registry.npmjs.org",
		);
		expect(body.versions["4.17.21"].dist.tarball).toContain("/lodash/-/lodash-4.17.21.tgz");
	});

	it("returns 403 for typosquat packages", async () => {
		const res = await workerFetch("/aj");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("typosquat");
		expect(body.error).toContain("ajv");
	});

	it("returns 404 when upstream has no data", async () => {
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("nonexistent-pkg-xyz"), { status: 404, body: JSON.stringify({ error: "not found" }) }],
			]),
		);

		const res = await workerFetch("/nonexistent-pkg-xyz");
		expect(res.status).toBe(404);
	});

	it("filters versions blocked by admin block rules", async () => {
		const metadata = makeNpmMetadata("blocked-pkg", ["1.0.0", "2.0.0", "3.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("blocked-pkg"), { status: 200, body: JSON.stringify(metadata) }],
				[downloadsUrl("blocked-pkg"), { status: 200, body: JSON.stringify({ downloads: 1_000 }) }],
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
				[upstreamUrl("fully-blocked"), { status: 200, body: JSON.stringify(metadata) }],
				[downloadsUrl("fully-blocked"), { status: 200, body: JSON.stringify({ downloads: 500 }) }],
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

	it("filters non-approved versions for tracked packages", async () => {
		const metadata = makeNpmMetadata("tracked-pkg", ["1.0.0", "1.1.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("tracked-pkg"), { status: 200, body: JSON.stringify(metadata) }],
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
		expect(body.versions["1.1.0"]).toBeUndefined();
		expect(body.versions["2.0.0"]).toBeUndefined();
	});

	it("passes through unknown versions but blocks known non-approved", async () => {
		const metadata = makeNpmMetadata("tracked-mixed", [
			"1.0.0",
			"1.1.0",
			"2.0.0",
			"3.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("tracked-mixed"), { status: 200, body: JSON.stringify(metadata) }],
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

	it("handles scoped package names", async () => {
		const metadata = makeNpmMetadata("@scope/lib", ["1.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@scope/lib"), { status: 200, body: JSON.stringify(metadata) }],
				[downloadsUrl("@scope/lib"), { status: 200, body: JSON.stringify({ downloads: 2_000 }) }],
			]),
		);

		const res = await workerFetch("/@scope/lib");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.name).toBe("@scope/lib");
	});
});

describe("GET /:scope/:name/:version (scoped version metadata)", () => {
	it("returns specific version data for scoped packages", async () => {
		const metadata = makeNpmMetadata("@test/ver-pkg", ["1.0.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/ver-pkg"), { status: 200, body: JSON.stringify(metadata) }],
			]),
		);

		const res = await workerFetch("/@test/ver-pkg/2.0.0");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.version).toBe("2.0.0");
		expect(body.name).toBe("@test/ver-pkg");
	});

	it("returns 404 for nonexistent version", async () => {
		const metadata = makeNpmMetadata("@test/ver-pkg2", ["1.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/ver-pkg2"), { status: 200, body: JSON.stringify(metadata) }],
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
		const metadata = makeNpmMetadata("@test/block-ver", ["1.0.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/block-ver"), { status: 200, body: JSON.stringify(metadata) }],
			]),
		);

		await createBlockRule(env.DB, {
			packageName: "@test/block-ver",
			versionPattern: ">=2.0.0",
		});

		const res = await workerFetch("/@test/block-ver/2.0.0");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("blocked by admin policy");
	});

	it("returns 403 for non-approved tracked versions", async () => {
		const metadata = makeNpmMetadata("@test/tracked-ver", ["1.0.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/tracked-ver"), { status: 200, body: JSON.stringify(metadata) }],
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
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("pending");
	});

	it("passes through unreviewed versions and fast-tracks review", async () => {
		const metadata = makeNpmMetadata("@test/unreviewed-ver", [
			"1.0.0",
			"2.0.0",
		]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/unreviewed-ver"), { status: 200, body: JSON.stringify(metadata) }],
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
		const metadata = makeNpmMetadata("@test/user-block", ["1.0.0", "2.0.0"]);
		mockUpstreamFetch(
			new Map([
				[upstreamUrl("@test/user-block"), { status: 200, body: JSON.stringify(metadata) }],
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
