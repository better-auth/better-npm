import type { Context, Next } from "hono";
import type { Env, RegistryContext } from "../types.js";

export async function requireAuth(
  c: Context<RegistryContext>,
  next: Next,
) {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json(
      {
        error:
          "Authentication required. Run `npx better-npm login` to get started.",
      },
      401,
    );
  }

  const rawToken = auth.slice(7);
  const tokenHash = await hashToken(rawToken);

  const row = await c.env.DB.prepare(
    `SELECT c.id, c.email, c.subscription_status
     FROM token t JOIN customer c ON t.customer_id = c.id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ id: string; email: string; subscription_status: string }>();

  if (!row) {
    return c.json(
      {
        error: "Invalid token. Run `npx better-npm login` to re-authenticate.",
      },
      401,
    );
  }

  if (row.subscription_status !== "active") {
    return c.json(
      {
        error:
          "Subscription inactive. Visit https://better-npm.dev to reactivate.",
      },
      403,
    );
  }

  c.set("customer", { id: row.id, email: row.email });

  // Update last_used_at (fire and forget)
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE token SET last_used_at = ? WHERE token_hash = ?")
      .bind(Date.now(), tokenHash)
      .run(),
  );

  await next();
}

async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
