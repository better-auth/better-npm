import { Hono } from "hono";
import type { Env } from "../types.js";
import { resolveAuth } from "./middleware.js";

const app = new Hono<{ Bindings: Env }>();

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
    `INSERT INTO customer (id, email, github_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       github_id = excluded.github_id,
       name = excluded.name,
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

app.get("/api/cli/status", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const result = await resolveAuth(c.env, auth.slice(7));
  if (result.error) return c.json({ error: "invalid token" }, 401);

  return c.json({
    email: result.data!.email,
  });
});

export { app as authRouter };
