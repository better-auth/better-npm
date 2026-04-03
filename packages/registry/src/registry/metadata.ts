import { Hono } from "hono";
import type { Context } from "hono";
import type { RegistryContext } from "../types.js";
import {
  getApprovedVersions,
  getBlocksForPackage,
  getPackageByName,
  getVersionByPackageAndVersion,
  insertCustomerUsage,
} from "../db/queries.js";
import {
  isCustomerBlocked,
  parseBlockRows,
  stripBlockedVersions,
} from "./customer-policy.js";
import {
  fetchUpstreamMetadata,
  rewriteTarballUrls,
} from "./upstream.js";

const app = new Hono<RegistryContext>();

app.get("/:scope/:name", handleMetadata);
app.get("/:name", handleMetadata);

function resolvePackageName(c: Context<RegistryContext>): string | null {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  if (!name) return null;
  return scope?.startsWith("@") ? `${scope}/${name}` : scope || name;
}

function logMetadataUsage(
  c: Context<RegistryContext>,
  packageName: string,
  version: string | null,
) {
  const customer = c.get("customer");
  if (!customer) return;
  c.executionCtx.waitUntil(
    insertCustomerUsage(c.env.DB, {
      id: crypto.randomUUID(),
      customerId: customer.id,
      packageName,
      version,
      kind: "metadata",
      createdAt: Date.now(),
    }),
  );
}

async function handleMetadata(c: Context<RegistryContext>) {
  const customer = c.get("customer");
  if (!customer) {
    return c.json({ error: "Authentication required." }, 401);
  }

  const packageName = resolvePackageName(c);
  if (!packageName) {
    return c.json({ error: "not found" }, 404);
  }
  const upstream = await fetchUpstreamMetadata(c.env, packageName);
  if (!upstream) {
    return c.json({ error: "not found" }, 404);
  }

  logMetadataUsage(c, packageName, null);

  const tracked = await getPackageByName(c.env.DB, packageName);

  if (tracked && upstream.versions) {
    const approved = await getApprovedVersions(c.env.DB, tracked.id);
    const approvedSet = new Set(approved.map((v) => v.version));

    if (approved.length > 0) {
      for (const ver of Object.keys(upstream.versions)) {
        if (!approvedSet.has(ver)) {
          delete upstream.versions[ver];
        }
      }

      if (upstream["dist-tags"]) {
        for (const [tag, ver] of Object.entries<string>(
          upstream["dist-tags"],
        )) {
          if (!approvedSet.has(ver)) {
            const fallback = findLatestApproved(
              approvedSet,
              upstream.versions,
            );
            if (fallback) {
              upstream["dist-tags"][tag] = fallback;
            } else {
              delete upstream["dist-tags"][tag];
            }
          }
        }
      }
    }
  }

  const blockRows = await getBlocksForPackage(
    c.env.DB,
    customer.id,
    packageName,
  );
  const { blockAll, blockedVersions } = parseBlockRows(blockRows);
  if (blockAll) {
    return c.json(
      { error: `${packageName} is blocked by your policy` },
      403,
    );
  }
  if (blockedVersions.size > 0) {
    stripBlockedVersions(upstream, blockedVersions);
  }

  if (
    upstream.versions &&
    Object.keys(upstream.versions).length === 0
  ) {
    return c.json(
      {
        error: `${packageName} has no versions available under your policy`,
      },
      403,
    );
  }

  const registryUrl = c.env.REGISTRY_URL || new URL(c.req.url).origin;
  const rewritten = rewriteTarballUrls(upstream, registryUrl);
  return c.json(rewritten);
}

function findLatestApproved(
  approvedSet: Set<string>,
  versions: Record<string, unknown>,
): string | null {
  const available = Object.keys(versions).filter((v) => approvedSet.has(v));
  if (available.length === 0) return null;
  return available[available.length - 1] ?? null;
}

app.get("/:scope/:name/:version", handleVersionMetadata);
app.get("/:name/:version", handleVersionMetadata);

function resolvePackageNameVersion(c: Context<RegistryContext>): {
  packageName: string;
  version: string;
} | null {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  const version = c.req.param("version");
  if (!name || !version) return null;
  const packageName = scope?.startsWith("@")
    ? `${scope}/${name}`
    : scope || name;
  return { packageName, version };
}

async function handleVersionMetadata(c: Context<RegistryContext>) {
  const customer = c.get("customer");
  if (!customer) {
    return c.json({ error: "Authentication required." }, 401);
  }

  const resolved = resolvePackageNameVersion(c);
  if (!resolved) {
    return c.json({ error: "not found" }, 404);
  }
  const { packageName, version } = resolved;

  const upstream = await fetchUpstreamMetadata(c.env, packageName);
  const versionData = upstream?.versions?.[version];
  if (!versionData) {
    return c.json({ error: "not found" }, 404);
  }

  logMetadataUsage(c, packageName, version);

  const blockRows = await getBlocksForPackage(
    c.env.DB,
    customer.id,
    packageName,
  );
  const parsed = parseBlockRows(blockRows);
  if (isCustomerBlocked(parsed.blockAll, parsed.blockedVersions, version)) {
    return c.json(
      { error: `${packageName}@${version} is blocked by your policy` },
      403,
    );
  }

  const tracked = await getPackageByName(c.env.DB, packageName);
  if (tracked) {
    const ver = await getVersionByPackageAndVersion(
      c.env.DB,
      tracked.id,
      version,
    );
    if (ver && ver.status !== "approved") {
      return c.json(
        {
          error: `${packageName}@${version} is ${ver.status} — not yet available`,
        },
        403,
      );
    }
  }

  return c.json(versionData);
}

export { app as metadataRouter };
