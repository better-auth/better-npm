import { Hono } from "hono";
import type { Env, ReviewMessage } from "./types.js";
import { metadataRouter } from "./registry/metadata.js";
import { tarballRouter } from "./registry/tarball.js";
import { authRouter } from "./auth/api.js";
import { requireAuth } from "./auth/middleware.js";
import { handleReviewQueue } from "./review/consumer.js";
import { syncFromChangesFeed } from "./watcher/changes.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/-/ping", (c) => c.json({ ok: true, registry: "better-npm" }));

// Auth API (CLI login, Stripe webhook) — no auth required on these
app.route("/", authRouter);

// Everything below requires a valid, paid token
app.use("/:path{.+}", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/")) return next();
  if (path === "/-/ping") return next();
  return requireAuth(c, next);
});

// Tarball downloads (must match before the generic metadata routes)
app.route("/", tarballRouter);

// Package metadata
app.route("/", metadataRouter);

export default {
  fetch: app.fetch,

  // Queue consumer — processes AI reviews
  async queue(
    batch: MessageBatch<ReviewMessage>,
    env: Env,
  ): Promise<void> {
    await handleReviewQueue(batch, env);
  },

  // Cron trigger — syncs npm changes feed every minute
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(syncFromChangesFeed(env));
  },
};
