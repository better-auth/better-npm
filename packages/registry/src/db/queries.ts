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
