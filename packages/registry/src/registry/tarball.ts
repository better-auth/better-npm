import { Hono } from "hono";
import type { Env } from "../types.js";
import { fetchUpstreamTarball } from "./upstream.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/:scope/:name/-/:filename", handleTarball);
app.get("/:name/-/:filename", handleTarball);

async function handleTarball(c: any) {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  const filename = c.req.param("filename");
  const packageName = scope?.startsWith("@")
    ? `${scope}/${name}`
    : scope || name;

  const r2Key = `${packageName}/${filename}`;

  // Check R2 cache first
  const cached = await c.env.TARBALLS.get(r2Key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Cache": "HIT",
      },
    });
  }

  // Fetch from upstream
  const upstreamUrl = `${c.env.UPSTREAM_REGISTRY}/${packageName}/-/${filename}`;
  const res = await fetchUpstreamTarball(c.env, upstreamUrl);

  if (!res || !res.body) {
    return c.json({ error: "tarball not found" }, 404);
  }

  // Tee the stream — one copy to R2 cache, one to the client
  const [cacheStream, clientStream] = res.body.tee();

  c.executionCtx.waitUntil(
    c.env.TARBALLS.put(r2Key, cacheStream, {
      httpMetadata: { contentType: "application/octet-stream" },
    }),
  );

  return new Response(clientStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Cache": "MISS",
    },
  });
}

export { app as tarballRouter };
