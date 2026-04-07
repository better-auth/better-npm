import { Hono } from "hono";
import type { Env, ReviewMessage } from "./types.js";
import { metadataRouter } from "./registry/metadata.js";
import { tarballRouter } from "./registry/tarball.js";
import { authRouter } from "./auth/api.js";
import { adminRouter } from "./admin/routes.js";
import { optionalAuth } from "./auth/middleware.js";
import { handleReviewQueue } from "./review/consumer.js";
import { syncFromChangesFeed } from "./watcher/changes.js";

const app = new Hono<{ Bindings: Env }>();

const RATE_LIMIT_PER_MINUTE = 5000;

app.use("*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  const window = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${window}`;
  try {
    const count = parseInt((await c.env.AUTH_CACHE.get(key)) || "0", 10);
    if (count > RATE_LIMIT_PER_MINUTE) {
      return c.json({ error: "rate limit exceeded, retry later" }, 429);
    }
    c.executionCtx.waitUntil(
      c.env.AUTH_CACHE.put(key, String(count + 1), { expirationTtl: 120 }),
    );
  } catch {}
  return next();
});

app.all("/-/*", async (c) => {
  if (c.req.path === "/-/ping") return c.json({ ok: true, registry: "better-npm" });
  return proxyToNpm(c);
});
app.put("*", async (c, next) => {
  if (c.req.path.startsWith("/api/")) return next();
  return proxyToNpm(c);
});

app.use("/api/internal/*", async (c, next) => {
  const secret = c.req.header("X-Internal-Secret");
  if (!c.env.INTERNAL_SECRET || !secret || !constantTimeEqual(secret, c.env.INTERNAL_SECRET)) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
});

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return (crypto.subtle as SubtleCryptoCf).timingSafeEqual(bufA, bufB);
}

interface SubtleCryptoCf extends SubtleCrypto {
  timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean;
}

app.route("/", authRouter);
app.route("/", adminRouter);

app.use("/:path{.+}", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/") || path === "/-/ping") return next();
  return optionalAuth(c, next);
});

app.route("/", tarballRouter);
app.route("/", metadataRouter);

const STRIPPED_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-warp-tag-id",
  "cf-ew-via",
  "cdn-loop",
  "x-forwarded-proto",
  "x-real-ip",
  "host",
]);

async function proxyToNpm(c: any) {
  const upstream = new URL(c.req.url);
  upstream.hostname = "registry.npmjs.org";
  upstream.port = "";
  upstream.protocol = "https:";

  const method = c.req.method;
  const headers = new Headers();
  for (const [key, val] of c.req.raw.headers.entries()) {
    if (!key.startsWith("cf-") && !STRIPPED_HEADERS.has(key)) {
      headers.set(key, val);
    }
  }
  headers.set("host", "registry.npmjs.org");

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await c.req.arrayBuffer();
  }

  const res = await fetch(upstream.toString(), { method, headers, body });
  let responseBody = await res.text();

  const registryUrl = new URL(c.req.url).origin;
  responseBody = responseBody.replaceAll("https://registry.npmjs.org", registryUrl);

  return new Response(responseBody, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}

export default {
  fetch: app.fetch,

  async queue(
    batch: MessageBatch<ReviewMessage>,
    env: Env,
  ): Promise<void> {
    await handleReviewQueue(batch, env);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(syncFromChangesFeed(env));
  },
};
