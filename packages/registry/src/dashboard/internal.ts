import { Hono } from "hono";
import type { Env } from "../types.js";
import {
  deleteCustomerBlock,
  getCustomerIdByEmail,
  getLatestReviewsForPackages,
  insertCustomerBlock,
  listCuratedUsageAggregates,
  listCustomerBlocks,
  listCustomerUsage,
} from "../db/queries.js";

const MAX_PACKAGE_NAME_LEN = 512;
const MAX_VERSION_LEN = 256;

type DashVars = { dashCustomerId: string };

const app = new Hono<{ Bindings: Env; Variables: DashVars }>();

app.use("*", async (c, next) => {
  const secret = c.env.REGISTRY_INTERNAL_SECRET;
  if (!secret) {
    return c.json({ error: "internal_unconfigured" }, 503);
  }
  const auth = c.req.header("authorization");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const email = c.req.header("x-customer-email")?.trim();
  if (!email) {
    return c.json({ error: "missing x-customer-email" }, 400);
  }
  const id = await getCustomerIdByEmail(c.env.DB, email);
  if (!id) {
    return c.json({ error: "customer not found" }, 404);
  }
  c.set("dashCustomerId", id);
  await next();
});

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 31) return true;
  }
  return false;
}

function validPackageName(s: string): boolean {
  if (!s || s.length > MAX_PACKAGE_NAME_LEN) return false;
  return !hasControlChars(s);
}

function validVersionSpec(s: string): boolean {
  if (!s || s.length > MAX_VERSION_LEN) return false;
  if (s === "*") return true;
  return !hasControlChars(s);
}

app.get("/blocks", async (c) => {
  const customerId = c.get("dashCustomerId");
  const blocks = await listCustomerBlocks(c.env.DB, customerId);
  return c.json({ blocks });
});

app.post("/blocks", async (c) => {
  const body = await c.req.json<{
    package_name?: string;
    version?: string;
  }>();
  const packageName = body.package_name?.trim();
  const version = (body.version?.trim() || "*") as string;
  if (!packageName || !validPackageName(packageName)) {
    return c.json({ error: "invalid package_name" }, 400);
  }
  if (!validVersionSpec(version)) {
    return c.json({ error: "invalid version" }, 400);
  }
  const customerId = c.get("dashCustomerId");
  const verNorm = version === "" ? "*" : version;
  const result = await insertCustomerBlock(c.env.DB, {
    id: crypto.randomUUID(),
    customerId,
    packageName,
    version: verNorm,
    createdAt: Date.now(),
  });
  if (!result.ok) {
    return c.json({ error: "already_blocked" }, 409);
  }
  return c.json({ ok: true });
});

app.delete("/blocks", async (c) => {
  const packageName = c.req.query("package_name")?.trim();
  const versionRaw = c.req.query("version");
  if (!packageName || !validPackageName(packageName)) {
    return c.json({ error: "invalid package_name" }, 400);
  }
  const version =
    versionRaw === undefined || versionRaw === "" ? "*" : versionRaw.trim();
  if (!validVersionSpec(version)) {
    return c.json({ error: "invalid version" }, 400);
  }
  const customerId = c.get("dashCustomerId");
  const { deleted } = await deleteCustomerBlock(
    c.env.DB,
    customerId,
    packageName,
    version,
  );
  if (deleted === 0) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true });
});

app.get("/activity", async (c) => {
  const limit = Math.min(
    100,
    Math.max(1, Number(c.req.query("limit")) || 50),
  );
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  const customerId = c.get("dashCustomerId");
  const activity = await listCustomerUsage(
    c.env.DB,
    customerId,
    limit,
    offset,
  );
  return c.json({ activity, limit, offset });
});

app.get("/packages", async (c) => {
  const limit = Math.min(
    100,
    Math.max(1, Number(c.req.query("limit")) || 50),
  );
  const customerId = c.get("dashCustomerId");
  const agg = await listCuratedUsageAggregates(c.env.DB, customerId, limit);
  const trackedIds = agg
    .map((r) => r.package_id)
    .filter((id): id is string => id != null);
  const reviewRows = await getLatestReviewsForPackages(
    c.env.DB,
    [...new Set(trackedIds)],
  );
  const reviewByPackage = new Map<
    string,
    (typeof reviewRows)[0]
  >();
  for (const r of reviewRows) {
    if (!reviewByPackage.has(r.package_id)) {
      reviewByPackage.set(r.package_id, r);
    }
  }
  const packages = agg.map((row) => {
    const rev = row.package_id
      ? reviewByPackage.get(row.package_id)
      : undefined;
    return {
      package_name: row.package_name,
      last_seen_at: row.last_seen,
      metadata_requests: row.metadata_count,
      tarball_downloads: row.tarball_count,
      tracked: row.package_id != null,
      latest_review: rev
        ? {
            version: rev.version,
            version_status: rev.version_status,
            risk_score: rev.risk_score,
            summary: rev.summary,
            review_created_at: rev.review_created_at,
          }
        : null,
    };
  });
  return c.json({ packages });
});

export { app as dashboardInternalRouter };
