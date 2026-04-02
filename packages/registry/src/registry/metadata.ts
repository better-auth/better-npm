import { Hono } from "hono";
import type { Env } from "../types.js";
import {
  getPackageByName,
  getApprovedVersions,
  getVersionByPackageAndVersion,
} from "../db/queries.js";
import {
  fetchUpstreamMetadata,
  rewriteTarballUrls,
} from "./upstream.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/:scope/:name", handleMetadata);
app.get("/:name", handleMetadata);

async function handleMetadata(c: any) {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  const packageName = scope?.startsWith("@")
    ? `${scope}/${name}`
    : scope || name;

  const upstream = await fetchUpstreamMetadata(c.env, packageName);
  if (!upstream) {
    return c.json({ error: "not found" }, 404);
  }

  const tracked = await getPackageByName(c.env.DB, packageName);

  // Untracked packages pass through from upstream as-is
  if (!tracked) {
    const registryUrl = c.env.REGISTRY_URL || new URL(c.req.url).origin;
    return c.json(rewriteTarballUrls(upstream, registryUrl));
  }

  // Filter to only approved versions
  if (upstream.versions) {
    const approved = await getApprovedVersions(c.env.DB, tracked.id);
    const approvedSet = new Set(approved.map((v) => v.version));

    // If we have reviewed versions, strip unapproved ones.
    // If zero reviewed yet (freshly added), pass through so installs aren't blocked.
    if (approved.length > 0) {
      for (const ver of Object.keys(upstream.versions)) {
        if (!approvedSet.has(ver)) {
          delete upstream.versions[ver];
        }
      }

      // Fix dist-tags to point at approved versions only
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

  const registryUrl = c.env.REGISTRY_URL || new URL(c.req.url).origin;
  const rewritten = rewriteTarballUrls(upstream, registryUrl);
  return c.json(rewritten);
}

function findLatestApproved(
  approvedSet: Set<string>,
  versions: Record<string, any>,
): string | null {
  const available = Object.keys(versions).filter((v) => approvedSet.has(v));
  return available.length > 0 ? available[available.length - 1] : null;
}

app.get("/:scope/:name/:version", handleVersionMetadata);
app.get("/:name/:version", handleVersionMetadata);

async function handleVersionMetadata(c: any) {
  const scope = c.req.param("scope");
  const name = c.req.param("name");
  const version = c.req.param("version");
  const packageName = scope?.startsWith("@")
    ? `${scope}/${name}`
    : scope || name;

  const upstream = await fetchUpstreamMetadata(c.env, packageName);
  const versionData = upstream?.versions?.[version];
  if (!versionData) {
    return c.json({ error: "not found" }, 404);
  }

  // If tracked, check if this version is blocked
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
