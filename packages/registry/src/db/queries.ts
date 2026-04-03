import type { Env, PackageRow, PackageVersionRow } from "../types.js";

export async function getPackageByName(
  db: D1Database,
  name: string,
): Promise<PackageRow | null> {
  return db
    .prepare("SELECT * FROM package WHERE name = ?")
    .bind(name)
    .first<PackageRow>();
}

export async function getApprovedVersions(
  db: D1Database,
  packageId: string,
): Promise<PackageVersionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM package_version WHERE package_id = ? AND status = 'approved'",
    )
    .bind(packageId)
    .all<PackageVersionRow>();
  return result.results;
}

export async function getVersionByPackageAndVersion(
  db: D1Database,
  packageId: string,
  version: string,
): Promise<PackageVersionRow | null> {
  return db
    .prepare(
      "SELECT * FROM package_version WHERE package_id = ? AND version = ?",
    )
    .bind(packageId, version)
    .first<PackageVersionRow>();
}

export async function getAllKnownVersions(
  db: D1Database,
  packageId: string,
): Promise<PackageVersionRow[]> {
  const result = await db
    .prepare("SELECT * FROM package_version WHERE package_id = ?")
    .bind(packageId)
    .all<PackageVersionRow>();
  return result.results;
}

export async function upsertPackage(
  db: D1Database,
  pkg: {
    id: string;
    name: string;
    description?: string;
    distTags?: string;
    latestKnown?: string;
    weeklyDownloads?: number;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO package (id, name, description, dist_tags, latest_known, weekly_downloads, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         dist_tags = excluded.dist_tags,
         latest_known = excluded.latest_known,
         weekly_downloads = excluded.weekly_downloads,
         updated_at = excluded.updated_at`,
    )
    .bind(
      pkg.id,
      pkg.name,
      pkg.description || null,
      pkg.distTags || null,
      pkg.latestKnown || null,
      pkg.weeklyDownloads || 0,
      now,
      now,
    )
    .run();
}

export async function insertVersion(
  db: D1Database,
  ver: {
    id: string;
    packageId: string;
    version: string;
    tarballSha: string;
    status?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO package_version (id, package_id, version, tarball_sha, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(package_id, version) DO NOTHING`,
    )
    .bind(
      ver.id,
      ver.packageId,
      ver.version,
      ver.tarballSha,
      ver.status || "pending",
      Date.now(),
    )
    .run();
}

export async function updateVersionStatus(
  db: D1Database,
  id: string,
  status: string,
): Promise<void> {
  await db
    .prepare("UPDATE package_version SET status = ? WHERE id = ?")
    .bind(status, id)
    .run();
}

export async function insertReview(
  db: D1Database,
  review: {
    id: string;
    packageVersionId: string;
    reviewerType: string;
    status: string;
    riskScore?: number;
    findings?: string;
    summary?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO review (id, package_version_id, reviewer_type, status, risk_score, findings, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      review.id,
      review.packageVersionId,
      review.reviewerType,
      review.status,
      review.riskScore ?? null,
      review.findings ?? null,
      review.summary ?? null,
      Date.now(),
    )
    .run();
}

export async function updateReview(
  db: D1Database,
  id: string,
  data: {
    status: string;
    riskScore?: number;
    findings?: string;
    summary?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE review SET status = ?, risk_score = ?, findings = ?, summary = ?, completed_at = ?
       WHERE id = ?`,
    )
    .bind(
      data.status,
      data.riskScore ?? null,
      data.findings ?? null,
      data.summary ?? null,
      Date.now(),
      id,
    )
    .run();
}

export async function getLastSeq(db: D1Database): Promise<string> {
  const row = await db
    .prepare("SELECT last_seq FROM sync_state WHERE id = 'main'")
    .first<{ last_seq: string }>();
  return row?.last_seq || "0";
}

export async function setLastSeq(
  db: D1Database,
  seq: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_state (id, last_seq, updated_at)
       VALUES ('main', ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
    )
    .bind(seq, Date.now())
    .run();
}

export async function getAllTrackedPackageNames(
  db: D1Database,
): Promise<string[]> {
  const result = await db
    .prepare("SELECT name FROM package")
    .all<{ name: string }>();
  return result.results.map((r) => r.name);
}

// ── Dashboard: blocks & usage ─────────────────────────────────────────────

export interface CustomerBlockRow {
  id: string;
  customer_id: string;
  package_name: string;
  version: string;
  created_at: number;
}

export async function getBlocksForPackage(
  db: D1Database,
  customerId: string,
  packageName: string,
): Promise<{ version: string }[]> {
  const result = await db
    .prepare(
      "SELECT version FROM customer_block WHERE customer_id = ? AND package_name = ?",
    )
    .bind(customerId, packageName)
    .all<{ version: string }>();
  return result.results;
}

export async function insertCustomerUsage(
  db: D1Database,
  row: {
    id: string;
    customerId: string;
    packageName: string;
    version: string | null;
    kind: "metadata" | "tarball";
    createdAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO customer_usage (id, customer_id, package_name, version, kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.customerId,
      row.packageName,
      row.version,
      row.kind,
      row.createdAt,
    )
    .run();
}

export async function listCustomerBlocks(
  db: D1Database,
  customerId: string,
): Promise<CustomerBlockRow[]> {
  const result = await db
    .prepare(
      `SELECT id, customer_id, package_name, version, created_at
       FROM customer_block WHERE customer_id = ? ORDER BY created_at DESC`,
    )
    .bind(customerId)
    .all<CustomerBlockRow>();
  return result.results;
}

export async function insertCustomerBlock(
  db: D1Database,
  row: {
    id: string;
    customerId: string;
    packageName: string;
    version: string;
    createdAt: number;
  },
): Promise<{ ok: true } | { ok: false; conflict: true }> {
  try {
    await db
      .prepare(
        `INSERT INTO customer_block (id, customer_id, package_name, version, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.customerId,
        row.packageName,
        row.version,
        row.createdAt,
      )
      .run();
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return { ok: false, conflict: true };
    }
    throw e;
  }
}

export async function deleteCustomerBlock(
  db: D1Database,
  customerId: string,
  packageName: string,
  version: string,
): Promise<{ deleted: number }> {
  const result = await db
    .prepare(
      `DELETE FROM customer_block WHERE customer_id = ? AND package_name = ? AND version = ?`,
    )
    .bind(customerId, packageName, version)
    .run();
  return { deleted: result.meta.changes ?? 0 };
}

export interface CustomerUsageRow {
  id: string;
  package_name: string;
  version: string | null;
  kind: string;
  created_at: number;
}

export async function listCustomerUsage(
  db: D1Database,
  customerId: string,
  limit: number,
  offset: number,
): Promise<CustomerUsageRow[]> {
  const result = await db
    .prepare(
      `SELECT id, package_name, version, kind, created_at
       FROM customer_usage WHERE customer_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(customerId, limit, offset)
    .all<CustomerUsageRow>();
  return result.results;
}

export async function getCustomerIdByEmail(
  db: D1Database,
  email: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export interface CuratedUsageAggRow {
  package_name: string;
  last_seen: number;
  metadata_count: number;
  tarball_count: number;
  package_id: string | null;
}

export async function listCuratedUsageAggregates(
  db: D1Database,
  customerId: string,
  limit: number,
): Promise<CuratedUsageAggRow[]> {
  const result = await db
    .prepare(
      `SELECT
         ua.package_name AS package_name,
         ua.last_seen AS last_seen,
         ua.metadata_count AS metadata_count,
         ua.tarball_count AS tarball_count,
         p.id AS package_id
       FROM (
         SELECT
           package_name,
           MAX(created_at) AS last_seen,
           SUM(CASE WHEN kind = 'metadata' THEN 1 ELSE 0 END) AS metadata_count,
           SUM(CASE WHEN kind = 'tarball' THEN 1 ELSE 0 END) AS tarball_count
         FROM customer_usage
         WHERE customer_id = ?
         GROUP BY package_name
       ) ua
       LEFT JOIN package p ON p.name = ua.package_name
       ORDER BY ua.last_seen DESC
       LIMIT ?`,
    )
    .bind(customerId, limit)
    .all<CuratedUsageAggRow>();
  return result.results;
}

export interface LatestReviewForPackageRow {
  package_id: string;
  risk_score: number | null;
  summary: string | null;
  version: string;
  version_status: string;
  review_created_at: number;
}

export async function getLatestReviewsForPackages(
  db: D1Database,
  packageIds: string[],
): Promise<LatestReviewForPackageRow[]> {
  if (packageIds.length === 0) return [];
  const placeholders = packageIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT
         pv.package_id AS package_id,
         r.risk_score AS risk_score,
         r.summary AS summary,
         pv.version AS version,
         pv.status AS version_status,
         r.created_at AS review_created_at
       FROM review r
       JOIN package_version pv ON pv.id = r.package_version_id
       WHERE pv.package_id IN (${placeholders})
       ORDER BY r.created_at DESC`,
    )
    .bind(...packageIds)
    .all<LatestReviewForPackageRow>();
  return result.results;
}
