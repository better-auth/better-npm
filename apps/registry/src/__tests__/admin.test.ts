import { describe, it, expect, beforeAll } from "vitest";
import { env, exports } from "cloudflare:workers";
import {
	runMigrations,
	createCustomer,
	createPackage,
	createPackageVersion,
} from "./helpers.js";

const BASE = "https://registry.test";
const SECRET_HEADER = { "X-Internal-Secret": "test-secret" };

function internalGet(path: string) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, { headers: SECRET_HEADER }),
	);
}

function internalPost(path: string, body: any) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, {
			method: "POST",
			headers: { ...SECRET_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

function internalPut(path: string, body: any) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, {
			method: "PUT",
			headers: { ...SECRET_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

function internalDelete(path: string) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, {
			method: "DELETE",
			headers: SECRET_HEADER,
		}),
	);
}

function internalPatch(path: string, body: any) {
	return exports.default.fetch(
		new Request(`${BASE}${path}`, {
			method: "PATCH",
			headers: { ...SECRET_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

beforeAll(async () => {
	await runMigrations(env.DB);
});

describe("GET /api/internal/admin/stats", () => {
	it("returns aggregate counts", async () => {
		const res = await internalGet("/api/internal/admin/stats");
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body).toHaveProperty("packages");
		expect(body).toHaveProperty("versions");
		expect(body).toHaveProperty("reviews");
		expect(body).toHaveProperty("customers");
		expect(body).toHaveProperty("pendingVersions");
		expect(body).toHaveProperty("totalInstalls");
		expect(typeof body.packages).toBe("number");
	});
});

describe("admin block rules", () => {
	it("creates and lists block rules", async () => {
		const createRes = await internalPost("/api/internal/admin/block-rules", {
			package_name: "malicious-pkg",
			version_pattern: "*",
			reason: "Known malware",
		});
		expect(createRes.status).toBe(200);

		const createBody = await createRes.json<{ ok: boolean; id: string }>();
		expect(createBody.ok).toBe(true);
		expect(createBody.id).toBeTruthy();

		const listRes = await internalGet("/api/internal/admin/block-rules");
		expect(listRes.status).toBe(200);

		const listBody = await listRes.json<{ rules: any[] }>();
		const rule = listBody.rules.find(
			(r) => r.package_name === "malicious-pkg",
		);
		expect(rule).toBeTruthy();
		expect(rule.version_pattern).toBe("*");
		expect(rule.reason).toBe("Known malware");
	});

	it("deletes a block rule", async () => {
		const createRes = await internalPost("/api/internal/admin/block-rules", {
			package_name: "to-delete-pkg",
			version_pattern: ">=1.0.0",
		});
		const { id } = await createRes.json<{ id: string }>();

		const deleteRes = await internalDelete(
			`/api/internal/admin/block-rules/${id}`,
		);
		expect(deleteRes.status).toBe(200);

		const listRes = await internalGet("/api/internal/admin/block-rules");
		const listBody = await listRes.json<{ rules: any[] }>();
		const deleted = listBody.rules.find((r) => r.id === id);
		expect(deleted).toBeUndefined();
	});

	it("rejects block rules with missing fields", async () => {
		const res = await internalPost("/api/internal/admin/block-rules", {
			package_name: "test",
		});
		expect(res.status).toBe(400);
	});

	it("rejects invalid admin version patterns", async () => {
		const res = await internalPost("/api/internal/admin/block-rules", {
			package_name: "bad-admin-pattern",
			version_pattern: "definitely not semver",
		});
		expect(res.status).toBe(400);

		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("invalid version_pattern");
	});

	it("filters block rules by search", async () => {
		await internalPost("/api/internal/admin/block-rules", {
			package_name: "search-target-xyz",
			version_pattern: "*",
		});

		const res = await internalGet(
			"/api/internal/admin/block-rules?search=search-target",
		);
		const body = await res.json<{ rules: any[] }>();
		expect(
			body.rules.some((r) => r.package_name === "search-target-xyz"),
		).toBe(true);
	});
});

describe("admin packages", () => {
	it("lists tracked packages", async () => {
		await createPackage(env.DB, { name: "admin-list-pkg" });

		const res = await internalGet("/api/internal/admin/packages");
		expect(res.status).toBe(200);

		const body = await res.json<{ packages: any[]; total: number }>();
		expect(body.packages.length).toBeGreaterThan(0);
		expect(body.total).toBeGreaterThan(0);
	});

	it("supports search filter", async () => {
		await createPackage(env.DB, { name: "unique-search-pkg-abc" });

		const res = await internalGet(
			"/api/internal/admin/packages?search=unique-search-pkg",
		);
		const body = await res.json<{ packages: any[] }>();
		expect(
			body.packages.some((p) => p.name === "unique-search-pkg-abc"),
		).toBe(true);
	});

	it("supports pagination", async () => {
		const res = await internalGet(
			"/api/internal/admin/packages?limit=1&offset=0",
		);
		const body = await res.json<{ packages: any[]; limit: number }>();
		expect(body.packages.length).toBeLessThanOrEqual(1);
		expect(body.limit).toBe(1);
	});
});

describe("admin package versions", () => {
	it("lists versions for a package", async () => {
		const pkgId = await createPackage(env.DB, { name: "versions-list-pkg" });
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});
		await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "2.0.0",
			status: "pending",
		});

		const res = await internalGet(
			`/api/internal/admin/packages/${pkgId}/versions`,
		);
		expect(res.status).toBe(200);

		const body = await res.json<{ versions: any[] }>();
		expect(body.versions).toHaveLength(2);
	});
});

describe("version moderation", () => {
	it("updates version status to approved", async () => {
		const pkgId = await createPackage(env.DB, { name: "mod-approve-pkg" });
		const verId = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "pending",
		});

		const res = await internalPatch(
			`/api/internal/admin/versions/${verId}/status`,
			{ status: "approved" },
		);
		expect(res.status).toBe(200);

		const ver = await env.DB.prepare(
			"SELECT status FROM package_version WHERE id = ?",
		)
			.bind(verId)
			.first<{ status: string }>();
		expect(ver!.status).toBe("approved");
	});

	it("updates version status to rejected", async () => {
		const pkgId = await createPackage(env.DB, { name: "mod-reject-pkg" });
		const verId = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "pending",
		});

		const res = await internalPatch(
			`/api/internal/admin/versions/${verId}/status`,
			{ status: "rejected" },
		);
		expect(res.status).toBe(200);

		const ver = await env.DB.prepare(
			"SELECT status FROM package_version WHERE id = ?",
		)
			.bind(verId)
			.first<{ status: string }>();
		expect(ver!.status).toBe("rejected");
	});

	it("rejects invalid status values", async () => {
		const res = await internalPatch(
			"/api/internal/admin/versions/some-id/status",
			{ status: "invalid" },
		);
		expect(res.status).toBe(400);
	});
});

describe("user stats", () => {
	it("returns stats for existing customer", async () => {
		const email = `stats-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-stats-${crypto.randomUUID()}`,
		});

		const res = await internalGet(
			`/api/internal/user/stats?email=${encodeURIComponent(email)}`,
		);
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body).toHaveProperty("installsToday");
		expect(body).toHaveProperty("installsWeek");
		expect(body).toHaveProperty("totalInstalls");
		expect(body).toHaveProperty("packages");
	});

	it("returns zero stats for unknown customer", async () => {
		const res = await internalGet(
			"/api/internal/user/stats?email=unknown@test.com",
		);
		expect(res.status).toBe(200);

		const body = await res.json<any>();
		expect(body.installsToday).toBe(0);
		expect(body.totalInstalls).toBe(0);
	});

	it("requires email parameter", async () => {
		const res = await internalGet("/api/internal/user/stats");
		expect(res.status).toBe(400);
	});
});

describe("user block rules", () => {
	it("creates and lists user block rules", async () => {
		const email = `ubr-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-ubr-${crypto.randomUUID()}`,
		});

		const createRes = await internalPost("/api/internal/user/block-rules", {
			email,
			package_name: "user-blocked-pkg",
			version_pattern: ">=3.0.0",
			reason: "Incompatible",
		});
		expect(createRes.status).toBe(200);

		const listRes = await internalGet(
			`/api/internal/user/block-rules?email=${encodeURIComponent(email)}`,
		);
		const listBody = await listRes.json<{ rules: any[] }>();
		const rule = listBody.rules.find(
			(r) => r.package_name === "user-blocked-pkg",
		);
		expect(rule).toBeTruthy();
		expect(rule.version_pattern).toBe(">=3.0.0");
	});

	it("creates a customer row when none exists (OAuth-only, no CLI register-token)", async () => {
		const email = `ubr-web-${crypto.randomUUID()}@test.com`;

		const createRes = await internalPost("/api/internal/user/block-rules", {
			email,
			package_name: "user-blocked-pkg",
			version_pattern: "*",
		});
		expect(createRes.status).toBe(200);

		const listRes = await internalGet(
			`/api/internal/user/block-rules?email=${encodeURIComponent(email)}`,
		);
		const listBody = await listRes.json<{ rules: { package_name: string }[] }>();
		expect(
			listBody.rules.some((r) => r.package_name === "user-blocked-pkg"),
		).toBe(true);
	});

	it("rejects invalid user version patterns", async () => {
		const email = `ubr-invalid-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-ubr-invalid-${crypto.randomUUID()}`,
		});

		const res = await internalPost("/api/internal/user/block-rules", {
			email,
			package_name: "user-invalid-pkg",
			version_pattern: "bad range",
		});
		expect(res.status).toBe(400);

		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("invalid version_pattern");
	});

	it("rejects overly long report reasons", async () => {
		const email = `ubr-long-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-ubr-long-${crypto.randomUUID()}`,
		});

		const res = await internalPost("/api/internal/user/block-rules", {
			email,
			package_name: "user-long-reason-pkg",
			version_pattern: "*",
			reason: "x".repeat(501),
		});
		expect(res.status).toBe(400);

		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("reason too long");
	});

	it("deletes user block rules", async () => {
		const email = `ubr-del-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-ubr-del-${crypto.randomUUID()}`,
		});

		const createRes = await internalPost("/api/internal/user/block-rules", {
			email,
			package_name: "user-del-pkg",
			version_pattern: "*",
		});
		const { id } = await createRes.json<{ id: string }>();

		const deleteRes = await internalDelete(
			`/api/internal/user/block-rules/${id}?email=${encodeURIComponent(email)}`,
		);
		expect(deleteRes.status).toBe(200);
	});
});

describe("admin user reports", () => {
	it("groups reports by package and version pattern", async () => {
		const email = `reports-${crypto.randomUUID()}@test.com`;
		const customerId = await createCustomer(env.DB, {
			email,
			githubId: `gh-reports-${crypto.randomUUID()}`,
		});

		await env.DB.prepare(
			"INSERT INTO user_block_rule (id, customer_id, package_name, version_pattern, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				crypto.randomUUID(),
				customerId,
				"reported-pkg",
				">=1.0.0 <2.0.0",
				"bad release line",
				Date.now(),
			)
			.run();
		await env.DB.prepare(
			"INSERT INTO user_block_rule (id, customer_id, package_name, version_pattern, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				crypto.randomUUID(),
				customerId,
				"reported-pkg",
				"^3.0.0",
				"bad major line",
				Date.now() + 1,
			)
			.run();
		await env.DB.prepare(
			"INSERT INTO block_rule (id, package_name, version_pattern, reason, created_at) VALUES (?, ?, ?, ?, ?)",
		)
			.bind(
				crypto.randomUUID(),
				"reported-pkg",
				">=1.0.0 <2.0.0",
				"covered by admin rule",
				Date.now(),
			)
			.run();

		const res = await internalGet("/api/internal/admin/user-reports");
		expect(res.status).toBe(200);

		const body = await res.json<{ reports: any[] }>();
		const covered = body.reports.find(
			(report) =>
				report.package_name === "reported-pkg" &&
				report.version_pattern === ">=1.0.0 <2.0.0",
		);
		const uncovered = body.reports.find(
			(report) =>
				report.package_name === "reported-pkg" &&
				report.version_pattern === "^3.0.0",
		);

		expect(covered).toBeTruthy();
		expect(covered.is_globally_blocked).toBe(true);
		expect(uncovered).toBeTruthy();
		expect(uncovered.is_globally_blocked).toBe(false);
	});
});

describe("user settings", () => {
	it("gets and updates min_weekly_downloads", async () => {
		const email = `settings-${crypto.randomUUID()}@test.com`;
		await createCustomer(env.DB, {
			email,
			githubId: `gh-set-${crypto.randomUUID()}`,
		});

		const getRes1 = await internalGet(
			`/api/internal/user/settings?email=${encodeURIComponent(email)}`,
		);
		const initial =
			await getRes1.json<{ min_weekly_downloads: number | null }>();
		expect(initial.min_weekly_downloads).toBeNull();

		const putRes = await internalPut("/api/internal/user/settings", {
			email,
			min_weekly_downloads: 10_000,
		});
		expect(putRes.status).toBe(200);

		const getRes2 = await internalGet(
			`/api/internal/user/settings?email=${encodeURIComponent(email)}`,
		);
		const updated =
			await getRes2.json<{ min_weekly_downloads: number }>();
		expect(updated.min_weekly_downloads).toBe(10_000);
	});
});

describe("admin customers", () => {
	it("lists customers with pagination", async () => {
		await createCustomer(env.DB, {
			email: `cust-list-${crypto.randomUUID()}@test.com`,
			githubId: `gh-cl-${crypto.randomUUID()}`,
		});

		const res = await internalGet("/api/internal/admin/customers?limit=10");
		expect(res.status).toBe(200);

		const body = await res.json<{ customers: any[]; total: number }>();
		expect(body.customers.length).toBeGreaterThan(0);
		expect(body.total).toBeGreaterThan(0);
	});
});
