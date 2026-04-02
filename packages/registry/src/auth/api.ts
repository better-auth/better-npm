import { Hono } from "hono";
import type { Env } from "../types.js";

const app = new Hono<{ Bindings: Env }>();

// ── POST /api/internal/register-token — web app pushes token after auth ─

app.post("/api/internal/register-token", async (c) => {
  const { email, github_id, name, token_hash } = await c.req.json<{
    email: string;
    github_id: string;
    name?: string;
    token_hash: string;
  }>();

  if (!email || !github_id || !token_hash) {
    return c.json({ error: "missing fields" }, 400);
  }

  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO customer (id, email, github_id, name, subscription_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       github_id = excluded.github_id,
       name = excluded.name,
       subscription_status = 'active',
       updated_at = excluded.updated_at`,
  )
    .bind(crypto.randomUUID(), email, github_id, name || null, now, now)
    .run();

  const customer = await c.env.DB.prepare(
    "SELECT id FROM customer WHERE email = ?",
  )
    .bind(email)
    .first<{ id: string }>();

  if (!customer) {
    return c.json({ error: "failed to create customer" }, 500);
  }

  await c.env.DB.prepare(
    "INSERT INTO token (id, customer_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), customer.id, token_hash, now)
    .run();

  return c.json({ ok: true });
});

// ── GET /api/cli/status — check current token validity ─────────────────

app.get("/api/cli/status", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const rawToken = auth.slice(7);
  const tokenHash = await hashToken(rawToken);

  const row = await c.env.DB.prepare(
    `SELECT c.email, c.subscription_status
     FROM token t JOIN customer c ON t.customer_id = c.id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ email: string; subscription_status: string }>();

  if (!row) return c.json({ error: "invalid token" }, 401);

  return c.json({ email: row.email, subscription: row.subscription_status });
});

// ── POST /api/stripe/webhook — Stripe calls this after payment ─────────

app.post("/api/stripe/webhook", async (c) => {
  const body = await c.req.text();
  const event = JSON.parse(body);

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object;
    const stripeCustomerId = sub.customer;
    const status = sub.status === "active" ? "active" : "cancelled";

    await c.env.DB.prepare(
      "UPDATE customer SET subscription_status = ?, updated_at = ? WHERE stripe_customer_id = ?",
    )
      .bind(status, Date.now(), stripeCustomerId)
      .run();
  }

  return c.json({ ok: true });
});

// ── Helpers ────────────────────────────────────────────────────────────

async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { app as authRouter };
