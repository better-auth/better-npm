import { Hono } from "hono";
import type { Context } from "hono";
import type { RegistryContext } from "../types.js";
import {
  getBlocksForPackage,
  insertCustomerUsage,
} from "../db/queries.js";
import {
  isCustomerBlocked,
  parseBlockRows,
  parseTarballVersion,
} from "./customer-policy.js";
import { fetchUpstreamTarball } from "./upstream.js";

const app = new Hono<RegistryContext>();

app.get("/:scope/:name/-/:filename", handleTarball);
app.get("/:name/-/:filename", handleTarball);

function resolveTarballTarget(c: Context<RegistryContext>): {
  packageName: string;
  unscopedName: string;
  filename: string;
} | null {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  const filename = c.req.param("filename");
  if (!name || !filename) {
    return null;
  }
  if (scope?.startsWith("@")) {
    return {
      packageName: `${scope}/${name}`,
      unscopedName: name,
      filename,
    };
  }
  return {
    packageName: scope || name,
    unscopedName: scope || name,
    filename,
  };
}

async function handleTarball(c: Context<RegistryContext>) {
  const customer = c.get("customer");
  if (!customer) {
    return c.json({ error: "Authentication required." }, 401);
  }

  const resolved = resolveTarballTarget(c);
  if (!resolved) {
    return c.json({ error: "not found" }, 404);
  }
  const { packageName, unscopedName, filename } = resolved;
  const parsedVersion = parseTarballVersion(filename, unscopedName);

  c.executionCtx.waitUntil(
    insertCustomerUsage(c.env.DB, {
      id: crypto.randomUUID(),
      customerId: customer.id,
      packageName,
      version: parsedVersion,
      kind: "tarball",
      createdAt: Date.now(),
    }),
  );

  const blockRows = await getBlocksForPackage(
    c.env.DB,
    customer.id,
    packageName,
  );
  const parsed = parseBlockRows(blockRows);
  if (
    isCustomerBlocked(parsed.blockAll, parsed.blockedVersions, parsedVersion)
  ) {
    return c.json(
      {
        error: `${packageName} tarball is blocked by your policy`,
      },
      403,
    );
  }

  const r2Key = `${packageName}/${filename}`;

  const cached = await c.env.TARBALLS.get(r2Key);
  if (cached) {
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
