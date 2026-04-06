import type { Context, Next } from "hono";
import type { Env, CachedAuth } from "../types.js";

const AUTH_CACHE_TTL = 300; // 5 minutes

export async function optionalAuth(c: Context<{ Bindings: Env }>, next: Next) {
  try {
    const auth = c.req.header("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const rawToken = auth.slice(7);
      const result = await resolveAuth(c.env, rawToken);
      if (result.data) {
        c.set("customerId", result.data.customerId);
      }
    }
  } catch {}
  await next();
}

export async function resolveAuth(
  env: Env,
  rawToken: string,
): Promise<{ data?: CachedAuth; error?: "invalid_token" }> {
  const tokenHash = await hashToken(rawToken);
  const cacheKey = `auth:${tokenHash}`;

  const cached = await env.AUTH_CACHE.get<CachedAuth>(cacheKey, "json");
  if (cached) return { data: cached };

  const row = await env.DB.prepare(
    `SELECT c.id, c.email
     FROM token t JOIN customer c ON t.customer_id = c.id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ id: string; email: string }>();

  if (!row) return { error: "invalid_token" };

  const data: CachedAuth = {
    customerId: row.id,
    email: row.email,
  };

  await env.AUTH_CACHE.put(cacheKey, JSON.stringify(data), {
    expirationTtl: AUTH_CACHE_TTL,
  });

  return { data };
}

export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
