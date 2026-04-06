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

  const customerId: string | undefined = c.get("customerId");

  const cached = await c.env.TARBALLS.get(r2Key);
  if (cached) {
    c.executionCtx.waitUntil(recordInstall(c.env.DB, packageName, filename, customerId, true));
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Cache": "HIT",
      },
    });
  }

  const upstreamUrl = `${c.env.UPSTREAM_REGISTRY}/${packageName}/-/${filename}`;
  const res = await fetchUpstreamTarball(c.env, upstreamUrl);

  if (!res || !res.body) {
    return c.json({ error: "tarball not found" }, 404);
  }

  const contentLength = Number(res.headers.get("content-length") || 0);

  c.executionCtx.waitUntil(recordInstall(c.env.DB, packageName, filename, customerId, false));

  if (contentLength > 5 * 1024 * 1024) {
    c.executionCtx.waitUntil(
      fetchAndCacheToR2(c.env, upstreamUrl, r2Key),
    );

    return new Response(res.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Cache": "MISS",
      },
    });
  }

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

async function recordInstall(
  db: D1Database,
  packageName: string,
  filename: string,
  customerId: string | undefined,
  cacheHit: boolean,
) {
  try {
    const versionStatus = await lookupVersionStatus(db, packageName, filename);
    const id = crypto.randomUUID();
    const ts = Date.now();
    const cid = customerId || null;
    const ch = cacheHit ? 1 : 0;
    try {
      await db
        .prepare(
          "INSERT INTO install (id, package_name, filename, customer_id, cache_hit, created_at, version_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, packageName, filename, cid, ch, ts, versionStatus)
        .run();
    } catch {
      await db
        .prepare(
          "INSERT INTO install (id, package_name, filename, customer_id, cache_hit, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, packageName, filename, cid, ch, ts)
        .run();
    }
  } catch {}
}

async function lookupVersionStatus(
  db: D1Database,
  packageName: string,
  filename: string,
): Promise<string> {
  try {
    const blockRule = await db
      .prepare("SELECT 1 FROM block_rule WHERE package_name = ? LIMIT 1")
      .bind(packageName)
      .first();
    if (blockRule) return "blocked";

    const match = filename.match(/-(\d+\.\d+\.\d+[^.]*)\.tgz$/);
    if (!match) return "unreviewed";

    const version = match[1];
    const row = await db
      .prepare(
        `SELECT pv.status FROM package_version pv
         JOIN package p ON p.id = pv.package_id
         WHERE p.name = ? AND pv.version = ?`,
      )
      .bind(packageName, version)
      .first<{ status: string }>();

    if (row?.status === "rejected") return "blocked";
    return row?.status ?? "unreviewed";
  } catch {
    return "unreviewed";
  }
}

async function fetchAndCacheToR2(env: Env, url: string, r2Key: string) {
  try {
    const res = await fetch(url);
    if (res.ok && res.body) {
      await env.TARBALLS.put(r2Key, res.body, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
    }
  } catch {}
}

export { app as tarballRouter };
