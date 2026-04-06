import {
	describe,
	it,
	expect,
	beforeAll,
	afterEach,
	vi,
} from "vitest";
import { env, exports } from "cloudflare:workers";
import { runMigrations, createCustomer, createToken } from "./helpers.js";
import { hashToken } from "../auth/middleware.js";

const BASE = "https://registry.test";

function workerFetch(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

beforeAll(async () => {
	await runMigrations(env.DB);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("GET /-/ping", () => {
	it("returns ok and registry name", async () => {
		const res = await workerFetch("/-/ping");
		expect(res.status).toBe(200);

		const body = await res.json<{ ok: boolean; registry: string }>();
		expect(body.ok).toBe(true);
		expect(body.registry).toBe("better-npm");
	});
});

describe("internal secret middleware", () => {
	it("blocks requests without the secret header", async () => {
		const res = await workerFetch("/api/internal/admin/stats");
		expect(res.status).toBe(403);

		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("forbidden");
	});

	it("blocks requests with an incorrect secret", async () => {
		const res = await workerFetch("/api/internal/admin/stats", {
			headers: { "X-Internal-Secret": "wrong-secret" },
		});
		expect(res.status).toBe(403);
	});

	it("allows requests with the correct secret", async () => {
		const res = await workerFetch("/api/internal/admin/stats", {
			headers: { "X-Internal-Secret": "test-secret" },
		});
		expect(res.status).toBe(200);
	});
});

describe("POST /api/internal/register-token", () => {
	it("creates a customer and token", async () => {
		const res = await workerFetch("/api/internal/register-token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Internal-Secret": "test-secret",
			},
			body: JSON.stringify({
				email: "register-test@example.com",
				github_id: "gh-register-123",
				name: "Test User",
				token_hash: "hash-register-abc",
			}),
		});

		expect(res.status).toBe(200);
		const body = await res.json<{ ok: boolean }>();
		expect(body.ok).toBe(true);

		const customer = await env.DB.prepare(
			"SELECT * FROM customer WHERE email = ?",
		)
			.bind("register-test@example.com")
			.first();
		expect(customer).toBeTruthy();
		expect(customer!.name).toBe("Test User");

		const token = await env.DB.prepare(
			"SELECT * FROM token WHERE token_hash = ?",
		)
			.bind("hash-register-abc")
			.first();
		expect(token).toBeTruthy();
	});

	it("rejects requests with missing fields", async () => {
		const res = await workerFetch("/api/internal/register-token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Internal-Secret": "test-secret",
			},
			body: JSON.stringify({ email: "x@test.com" }),
		});

		expect(res.status).toBe(400);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("missing fields");
	});
});

describe("GET /api/cli/status", () => {
	it("returns email for a valid bearer token", async () => {
		const rawToken = "test-token-status-" + crypto.randomUUID();
		const tokenHash = await hashToken(rawToken);
		const email = `status-${crypto.randomUUID()}@test.com`;
		const customerId = await createCustomer(env.DB, {
			email,
			githubId: `gh-${crypto.randomUUID()}`,
		});
		await createToken(env.DB, { customerId, tokenHash });

		const res = await workerFetch("/api/cli/status", {
			headers: { Authorization: `Bearer ${rawToken}` },
		});

		expect(res.status).toBe(200);
		const body = await res.json<{ email: string }>();
		expect(body.email).toBe(email);
	});

	it("returns 401 without authorization header", async () => {
		const res = await workerFetch("/api/cli/status");
		expect(res.status).toBe(401);
	});

	it("returns 401 for an invalid token", async () => {
		const res = await workerFetch("/api/cli/status", {
			headers: { Authorization: "Bearer invalid-token-xyz" },
		});
		expect(res.status).toBe(401);
	});
});
