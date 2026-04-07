import { Hono } from "hono";
import semver from "semver";
import type { Env } from "../types.js";

const app = new Hono<{ Bindings: Env }>();

const MAX_PACKAGE_NAME_LENGTH = 214;
const MAX_VERSION_PATTERN_LENGTH = 128;
const MAX_REASON_LENGTH = 500;
const MAX_USER_REPORTS = 250;
const MAX_REPORTERS_PER_GROUP = 20;

function normalizeBlockRuleInput(input: {
  package_name?: string;
  version_pattern?: string;
  reason?: string;
}) {
  const packageName = input.package_name?.trim() || "";
  const versionPattern = input.version_pattern?.trim() || "";
  const reason = input.reason?.trim() || null;

  if (!packageName || !versionPattern) {
    return { error: "package_name and version_pattern required" } as const;
  }

  if (packageName.length > MAX_PACKAGE_NAME_LENGTH) {
    return { error: "package_name too long" } as const;
  }

  if (versionPattern.length > MAX_VERSION_PATTERN_LENGTH) {
    return { error: "version_pattern too long" } as const;
  }

  if (
    versionPattern !== "*" &&
    semver.validRange(versionPattern, { includePrerelease: true }) === null
  ) {
    return { error: "invalid version_pattern" } as const;
  }

  if (reason && reason.length > MAX_REASON_LENGTH) {
    return { error: "reason too long" } as const;
  }

  return {
    packageName,
    versionPattern,
    reason,
  } as const;
}

/** Web dashboard users may never hit CLI register-token; ensure a registry row exists. */
async function ensureCustomerByEmail(
  db: D1Database,
  email: string,
): Promise<{ id: string }> {
  const now = Date.now();
  const newId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO customer (id, email, github_id, name, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, ?)
       ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at`,
    )
    .bind(newId, email, now, now)
    .run();

  const row = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!row) {
    throw new Error("ensureCustomerByEmail: customer missing after upsert");
  }
  return row;
}

app.get("/api/internal/admin/stats", async (c) => {
  const db = c.env.DB;

  const [packages, versions, reviews, customers] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM package").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM package_version").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM review").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM customer").first<{ count: number }>(),
  ]);

  const [pendingVersions, rejectedVersions, approvedVersions] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM package_version WHERE status = 'pending'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM package_version WHERE status = 'rejected'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM package_version WHERE status = 'approved'").first<{ count: number }>(),
  ]);

  const now = Date.now();
  const [recentReviews, totalInstalls, installsToday, installsWeek] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM review WHERE created_at > ?").bind(now - 86400000).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM install").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM install WHERE created_at > ?").bind(now - 86400000).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM install WHERE created_at > ?").bind(now - 7 * 86400000).first<{ count: number }>(),
  ]);

  return c.json({
    packages: packages?.count || 0,
    versions: versions?.count || 0,
    reviews: reviews?.count || 0,
    customers: customers?.count || 0,
    pendingVersions: pendingVersions?.count || 0,
    rejectedVersions: rejectedVersions?.count || 0,
    approvedVersions: approvedVersions?.count || 0,
    recentReviews: recentReviews?.count || 0,
    totalInstalls: totalInstalls?.count || 0,
    installsToday: installsToday?.count || 0,
    installsWeek: installsWeek?.count || 0,
  });
});

app.get("/api/internal/user/stats", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  const now = Date.now();

  if (!customer) {
    return c.json({
      installsToday: 0,
      installsWeek: 0,
      totalInstalls: 0,
      packages: 0,
    });
  }

  const [installsToday, installsWeek, totalInstalls, distinctUserPackages] =
    await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) as count FROM install WHERE customer_id = ? AND created_at > ?",
        )
        .bind(customer.id, now - 86400000)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) as count FROM install WHERE customer_id = ? AND created_at > ?",
        )
        .bind(customer.id, now - 7 * 86400000)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) as count FROM install WHERE customer_id = ?",
        )
        .bind(customer.id)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COUNT(DISTINCT package_name) as count FROM install WHERE customer_id = ?",
        )
        .bind(customer.id)
        .first<{ count: number }>(),
    ]);

  return c.json({
    installsToday: installsToday?.count || 0,
    installsWeek: installsWeek?.count || 0,
    totalInstalls: totalInstalls?.count || 0,
    packages: distinctUserPackages?.count || 0,
  });
});

app.get("/api/internal/user/stats/extended", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!customer) {
    return c.json({
      mostInstalledPackage: null,
      uniquePackages: 0,
      cacheHitRate: 0,
      busiestDay: null,
      installsThisMonth: 0,
      streak: 0,
      blockedPackages: 0,
    });
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;

  const [mostInstalled, uniquePkgs, cacheStats, busiestDay, monthInstalls, recentDays, blockedPkgs] =
    await Promise.all([
      db
        .prepare(
          "SELECT package_name, COUNT(*) as cnt FROM install WHERE customer_id = ? GROUP BY package_name ORDER BY cnt DESC LIMIT 1",
        )
        .bind(customer.id)
        .first<{ package_name: string; cnt: number }>(),
      db
        .prepare(
          "SELECT COUNT(DISTINCT package_name) as count FROM install WHERE customer_id = ?",
        )
        .bind(customer.id)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) as total, SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as hits FROM install WHERE customer_id = ?",
        )
        .bind(customer.id)
        .first<{ total: number; hits: number }>(),
      db
        .prepare(
          "SELECT strftime('%w', created_at / 1000, 'unixepoch') as dow, COUNT(*) as cnt FROM install WHERE customer_id = ? GROUP BY dow ORDER BY cnt DESC LIMIT 1",
        )
        .bind(customer.id)
        .first<{ dow: string; cnt: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) as count FROM install WHERE customer_id = ? AND created_at > ?",
        )
        .bind(customer.id, thirtyDaysAgo)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT DISTINCT date(created_at / 1000, 'unixepoch') as d FROM install WHERE customer_id = ? ORDER BY d DESC LIMIT 90",
        )
        .bind(customer.id)
        .all<{ d: string }>(),
      db
        .prepare(
          "SELECT COUNT(DISTINCT i.package_name) as count FROM install i WHERE i.customer_id = ? AND (EXISTS (SELECT 1 FROM block_rule br WHERE br.package_name = i.package_name) OR EXISTS (SELECT 1 FROM package p JOIN package_version pv ON pv.package_id = p.id WHERE p.name = i.package_name AND pv.status = 'rejected'))",
        )
        .bind(customer.id)
        .first<{ count: number }>(),
    ]);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let streak = 0;
  if (recentDays.results.length > 0) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split("T")[0];

    const days = recentDays.results.map((r) => r.d);
    // Streak must start from today or yesterday
    if (days[0] === todayStr || days[0] === yesterdayStr) {
      streak = 1;
      for (let i = 1; i < days.length; i++) {
        const prev = new Date(days[i - 1] + "T00:00:00Z");
        const curr = new Date(days[i] + "T00:00:00Z");
        const diff = (prev.getTime() - curr.getTime()) / 86400000;
        if (diff === 1) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  const cacheHitRate =
    cacheStats && cacheStats.total > 0
      ? Math.round((cacheStats.hits / cacheStats.total) * 100)
      : 0;

  return c.json({
    mostInstalledPackage: mostInstalled
      ? { name: mostInstalled.package_name, count: mostInstalled.cnt }
      : null,
    uniquePackages: uniquePkgs?.count || 0,
    cacheHitRate,
    busiestDay: busiestDay
      ? { day: dayNames[Number(busiestDay.dow)] || "Unknown", count: busiestDay.cnt }
      : null,
    installsThisMonth: monthInstalls?.count || 0,
    streak,
    blockedPackages: blockedPkgs?.count || 0,
  });
});

app.get("/api/internal/user/activity", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!customer) {
    return c.json({ activity: [], total: 0 });
  }

  let result;
  try {
    result = await db
      .prepare(
        "SELECT id, package_name, filename, cache_hit, created_at, version_status FROM install WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .bind(customer.id, limit, offset)
      .all();
  } catch {
    result = await db
      .prepare(
        "SELECT id, package_name, filename, cache_hit, created_at FROM install WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .bind(customer.id, limit, offset)
      .all();
  }

  const total = await db
    .prepare(
      "SELECT COUNT(*) as count FROM install WHERE customer_id = ?",
    )
    .bind(customer.id)
    .first<{ count: number }>();

  const pkgNames = [...new Set(result.results.map((r: any) => r.package_name as string))];
  const blockedNames = new Set<string>();
  if (pkgNames.length > 0) {
    const placeholders = pkgNames.map(() => "?").join(",");
    const blocked = await db
      .prepare(`SELECT DISTINCT package_name FROM block_rule WHERE package_name IN (${placeholders})`)
      .bind(...pkgNames)
      .all<{ package_name: string }>();
    for (const b of blocked.results) {
      blockedNames.add(b.package_name);
    }
  }

  const activity = result.results.map((r: any) => ({
    ...r,
    version_status: blockedNames.has(r.package_name)
      ? "blocked"
      : r.version_status === "rejected"
        ? "blocked"
        : r.version_status ?? "unreviewed",
  }));

  return c.json({
    activity,
    total: total?.count || 0,
    limit,
    offset,
  });
});

app.get("/api/internal/user/packages", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || "";

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!customer) return c.json({ packages: [], total: 0 });

  let query = `
    SELECT
      package_name,
      COUNT(*) as install_count,
      COUNT(DISTINCT filename) as version_count,
      MAX(created_at) as last_installed,
      MIN(created_at) as first_installed
    FROM install
    WHERE customer_id = ?`;
  const args: any[] = [customer.id];

  if (search) {
    query += " AND package_name LIKE ?";
    args.push(`%${search}%`);
  }

  const SORT_COLUMNS: Record<string, string> = {
    name: "package_name",
    installs: "install_count",
    versions: "version_count",
    recent: "last_installed",
  };
  const sortCol = SORT_COLUMNS[c.req.query("sort") || ""] || "last_installed";
  const sortDir = c.req.query("order") === "asc" ? "ASC" : "DESC";

  query += ` GROUP BY package_name ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`;
  args.push(limit, offset);

  const result = await db.prepare(query).bind(...args).all();

  let totalQuery = "SELECT COUNT(DISTINCT package_name) as count FROM install WHERE customer_id = ?";
  const totalArgs: any[] = [customer.id];
  if (search) {
    totalQuery += " AND package_name LIKE ?";
    totalArgs.push(`%${search}%`);
  }
  const total = await db.prepare(totalQuery).bind(...totalArgs).first<{ count: number }>();

  const pkgNames = result.results.map((r: any) => r.package_name as string);
  const statusMap = new Map<string, string>();
  if (pkgNames.length > 0) {
    const placeholders = pkgNames.map(() => "?").join(",");
    const blocked = await db
      .prepare(`SELECT DISTINCT package_name FROM block_rule WHERE package_name IN (${placeholders})`)
      .bind(...pkgNames)
      .all<{ package_name: string }>();
    for (const b of blocked.results) {
      statusMap.set(b.package_name, "blocked");
    }

    const tracked = await db
      .prepare(`SELECT name, weekly_downloads FROM package WHERE name IN (${placeholders})`)
      .bind(...pkgNames)
      .all<{ name: string; weekly_downloads: number }>();
    for (const t of tracked.results) {
      if (!statusMap.has(t.name)) {
        statusMap.set(t.name, "tracked");
      }
    }
  }

  const packages = result.results.map((r: any) => ({
    ...r,
    status: statusMap.get(r.package_name) || "untracked",
  }));

  return c.json({
    packages,
    total: total?.count || 0,
    limit,
    offset,
  });
});

app.get("/api/internal/user/packages/detail", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  const packageName = c.req.query("name");
  if (!email || !packageName) return c.json({ error: "email and name required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!customer) return c.json({ error: "customer not found" }, 404);

  const versions = await db
    .prepare(`
      SELECT
        filename,
        COUNT(*) as install_count,
        MAX(created_at) as last_installed,
        MIN(created_at) as first_installed,
        version_status
      FROM install
      WHERE customer_id = ? AND package_name = ?
      GROUP BY filename
      ORDER BY last_installed DESC
    `)
    .bind(customer.id, packageName)
    .all();

  const totals = await db
    .prepare("SELECT COUNT(*) as count, MIN(created_at) as first, MAX(created_at) as last FROM install WHERE customer_id = ? AND package_name = ?")
    .bind(customer.id, packageName)
    .first<{ count: number; first: number; last: number }>();

  const recentInstalls = await db
    .prepare(
      "SELECT filename, cache_hit, created_at, version_status FROM install WHERE customer_id = ? AND package_name = ? ORDER BY created_at DESC LIMIT 20",
    )
    .bind(customer.id, packageName)
    .all();

  const tracked = await db
    .prepare("SELECT id, weekly_downloads, description, latest_known FROM package WHERE name = ?")
    .bind(packageName)
    .first<{ id: string; weekly_downloads: number; description: string | null; latest_known: string | null }>();

  let reviewInfo: any[] = [];
  if (tracked) {
    const versionRows = await db
      .prepare("SELECT id, version, status FROM package_version WHERE package_id = ? ORDER BY created_at DESC LIMIT 10")
      .bind(tracked.id)
      .all();
    reviewInfo = versionRows.results;
  }

  const isBlocked = await db
    .prepare("SELECT 1 FROM block_rule WHERE package_name = ? LIMIT 1")
    .bind(packageName)
    .first();

  return c.json({
    package_name: packageName,
    total_installs: totals?.count || 0,
    first_installed: totals?.first || null,
    last_installed: totals?.last || null,
    versions: versions.results,
    recent: recentInstalls.results,
    tracked: tracked ? {
      weekly_downloads: tracked.weekly_downloads,
      description: tracked.description,
      latest_known: tracked.latest_known,
    } : null,
    review_status: reviewInfo,
    is_blocked: !!isBlocked,
  });
});

app.get("/api/internal/admin/packages", async (c) => {
  const db = c.env.DB;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);
  const search = c.req.query("search") || "";

  let query = "SELECT * FROM package";
  const args: any[] = [];

  if (search) {
    query += " WHERE name LIKE ?";
    args.push(`%${search}%`);
  }

  query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const result = await db.prepare(query).bind(...args).all();

  const total = await db
    .prepare(search ? "SELECT COUNT(*) as count FROM package WHERE name LIKE ?" : "SELECT COUNT(*) as count FROM package")
    .bind(...(search ? [`%${search}%`] : []))
    .first<{ count: number }>();

  return c.json({
    packages: result.results,
    total: total?.count || 0,
    limit,
    offset,
  });
});

app.get("/api/internal/admin/packages/:id/versions", async (c) => {
  const db = c.env.DB;
  const packageId = c.req.param("id");

  const result = await db
    .prepare("SELECT * FROM package_version WHERE package_id = ? ORDER BY created_at DESC")
    .bind(packageId)
    .all();

  return c.json({ versions: result.results });
});

app.get("/api/internal/admin/reviews", async (c) => {
  const db = c.env.DB;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);
  const status = c.req.query("status") || "";

  let query = `
    SELECT r.*, pv.version, pv.status as version_status, p.name as package_name
    FROM review r
    JOIN package_version pv ON r.package_version_id = pv.id
    JOIN package p ON pv.package_id = p.id
  `;
  const args: any[] = [];

  if (status) {
    query += " WHERE r.status = ?";
    args.push(status);
  }

  query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const result = await db.prepare(query).bind(...args).all();

  const totalQuery = status
    ? "SELECT COUNT(*) as count FROM review WHERE status = ?"
    : "SELECT COUNT(*) as count FROM review";
  const total = await db
    .prepare(totalQuery)
    .bind(...(status ? [status] : []))
    .first<{ count: number }>();

  return c.json({
    reviews: result.results,
    total: total?.count || 0,
    limit,
    offset,
  });
});

app.get("/api/internal/admin/customers", async (c) => {
  const db = c.env.DB;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);

  const result = await db
    .prepare("SELECT * FROM customer ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all();

  const total = await db
    .prepare("SELECT COUNT(*) as count FROM customer")
    .first<{ count: number }>();

  return c.json({
    customers: result.results,
    total: total?.count || 0,
    limit,
    offset,
  });
});

app.get("/api/internal/admin/user-reports", async (c) => {
  const db = c.env.DB;

  const reports = await db
    .prepare(`
      SELECT
        ubr.package_name,
        ubr.version_pattern,
        ubr.reason,
        ubr.created_at,
        c.email
      FROM user_block_rule ubr
      JOIN customer c ON ubr.customer_id = c.id
      WHERE ubr.reason IS NOT NULL AND ubr.reason != ''
      ORDER BY ubr.created_at DESC
      LIMIT ${MAX_USER_REPORTS}
    `)
    .all<{
      package_name: string;
      version_pattern: string;
      reason: string;
      created_at: number;
      email: string;
    }>();

  const grouped = new Map<string, {
    package_name: string;
    version_pattern: string;
    report_count: number;
    reporters: { email: string; reason: string; created_at: number }[];
    latest_report: number;
    is_globally_blocked: boolean;
  }>();

  for (const r of reports.results) {
    const key = `${r.package_name}\u0000${r.version_pattern}`;
    const existing = grouped.get(key);
    const reporter = {
      email: r.email,
      reason: r.reason,
      created_at: r.created_at,
    };
    if (existing) {
      existing.report_count++;
      if (existing.reporters.length < MAX_REPORTERS_PER_GROUP) {
        existing.reporters.push(reporter);
      }
      if (r.created_at > existing.latest_report) {
        existing.latest_report = r.created_at;
      }
    } else {
      grouped.set(key, {
        package_name: r.package_name,
        version_pattern: r.version_pattern,
        report_count: 1,
        reporters: [reporter],
        latest_report: r.created_at,
        is_globally_blocked: false,
      });
    }
  }

  if (grouped.size > 0) {
    const names = [...new Set([...grouped.values()].map((report) => report.package_name))];
    const placeholders = names.map(() => "?").join(",");
    const blocked = await db
      .prepare(`
        SELECT package_name, version_pattern
        FROM block_rule
        WHERE package_name IN (${placeholders})
      `)
      .bind(...names)
      .all<{ package_name: string; version_pattern: string }>();

    const blockedByPackage = new Map<string, Set<string>>();
    for (const b of blocked.results) {
      const patterns = blockedByPackage.get(b.package_name) || new Set<string>();
      patterns.add(b.version_pattern);
      blockedByPackage.set(b.package_name, patterns);
    }

    for (const entry of grouped.values()) {
      const patterns = blockedByPackage.get(entry.package_name);
      if (!patterns) continue;
      entry.is_globally_blocked =
        patterns.has("*") || patterns.has(entry.version_pattern);
    }
  }

  const sorted = [...grouped.values()].sort(
    (a, b) => b.report_count - a.report_count || b.latest_report - a.latest_report,
  );

  return c.json({ reports: sorted });
});

app.get("/api/internal/admin/block-rules", async (c) => {
  const db = c.env.DB;
  const search = c.req.query("search") || "";

  let query = "SELECT * FROM block_rule";
  const args: any[] = [];

  if (search) {
    query += " WHERE package_name LIKE ?";
    args.push(`%${search}%`);
  }

  query += " ORDER BY created_at DESC";

  const result = await db.prepare(query).bind(...args).all();
  return c.json({ rules: result.results });
});

app.post("/api/internal/admin/block-rules", async (c) => {
  const db = c.env.DB;
  const { package_name, version_pattern, reason, created_by } =
    await c.req.json<{
      package_name: string;
      version_pattern: string;
      reason?: string;
      created_by?: string;
    }>();

  const normalized = normalizeBlockRuleInput({
    package_name,
    version_pattern,
    reason,
  });
  if ("error" in normalized) {
    return c.json({ error: normalized.error }, 400);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO block_rule (id, package_name, version_pattern, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      normalized.packageName,
      normalized.versionPattern,
      normalized.reason,
      created_by || null,
      Date.now(),
    )
    .run();

  return c.json({ ok: true, id });
});

app.delete("/api/internal/admin/block-rules/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM block_rule WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/api/internal/user/block-rules", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!customer) return c.json({ rules: [] });

  const result = await db
    .prepare("SELECT * FROM user_block_rule WHERE customer_id = ? ORDER BY created_at DESC")
    .bind(customer.id)
    .all();

  return c.json({ rules: result.results });
});

app.post("/api/internal/user/block-rules", async (c) => {
  const db = c.env.DB;
  const { email, package_name, version_pattern, reason } = await c.req.json<{
    email: string;
    package_name: string;
    version_pattern: string;
    reason?: string;
  }>();

  if (!email || !package_name || !version_pattern) {
    return c.json({ error: "email, package_name and version_pattern required" }, 400);
  }

  const normalized = normalizeBlockRuleInput({
    package_name,
    version_pattern,
    reason,
  });
  if ("error" in normalized) {
    return c.json({ error: normalized.error }, 400);
  }

  const customer = await ensureCustomerByEmail(db, email);

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO user_block_rule (id, customer_id, package_name, version_pattern, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      customer.id,
      normalized.packageName,
      normalized.versionPattern,
      normalized.reason,
      Date.now(),
    )
    .run();

  return c.json({ ok: true, id });
});

app.delete("/api/internal/user/block-rules/:id", async (c) => {
  const db = c.env.DB;
  const ruleId = c.req.param("id");
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await ensureCustomerByEmail(db, email);

  await db
    .prepare("DELETE FROM user_block_rule WHERE id = ? AND customer_id = ?")
    .bind(ruleId, customer.id)
    .run();

  return c.json({ ok: true });
});

app.get("/api/internal/user/settings", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (!customer) return c.json({ min_weekly_downloads: null });

  const settings = await db
    .prepare("SELECT min_weekly_downloads FROM user_settings WHERE id = ?")
    .bind(customer.id)
    .first<{ min_weekly_downloads: number | null }>();

  return c.json({ min_weekly_downloads: settings?.min_weekly_downloads ?? null });
});

app.put("/api/internal/user/settings", async (c) => {
  const db = c.env.DB;
  const { email, min_weekly_downloads } = await c.req.json<{
    email: string;
    min_weekly_downloads: number | null;
  }>();
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await ensureCustomerByEmail(db, email);

  await db
    .prepare(
      "INSERT INTO user_settings (id, min_weekly_downloads) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET min_weekly_downloads = excluded.min_weekly_downloads",
    )
    .bind(customer.id, min_weekly_downloads)
    .run();

  return c.json({ ok: true });
});

app.get("/api/internal/user/stats/heatmap", async (c) => {
  const db = c.env.DB;
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email required" }, 400);

  const customer = await db
    .prepare("SELECT id FROM customer WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  if (!customer) return c.json({ days: [] });

  const sixMonthsAgo = Date.now() - 180 * 86400000;

  const dailyCounts = await db
    .prepare(
      `SELECT
        date(created_at / 1000, 'unixepoch') as day,
        COUNT(*) as count
      FROM install
      WHERE customer_id = ? AND created_at > ?
      GROUP BY day
      ORDER BY day ASC`,
    )
    .bind(customer.id, sixMonthsAgo)
    .all<{ day: string; count: number }>();

  const topPackages = await db
    .prepare(
      `SELECT
        date(created_at / 1000, 'unixepoch') as day,
        package_name,
        COUNT(*) as cnt
      FROM install
      WHERE customer_id = ? AND created_at > ?
      GROUP BY day, package_name
      ORDER BY day ASC, cnt DESC`,
    )
    .bind(customer.id, sixMonthsAgo)
    .all<{ day: string; package_name: string; cnt: number }>();

  const packagesByDay = new Map<string, { name: string; count: number }[]>();
  for (const row of topPackages.results) {
    const list = packagesByDay.get(row.day) || [];
    if (list.length < 3) list.push({ name: row.package_name, count: row.cnt });
    packagesByDay.set(row.day, list);
  }

  const days = dailyCounts.results.map((d) => ({
    date: d.day,
    count: d.count,
    packages: packagesByDay.get(d.day) || [],
  }));

  return c.json({ days });
});

app.patch("/api/internal/admin/versions/:id/status", async (c) => {
  const db = c.env.DB;
  const versionId = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();

  if (!["approved", "rejected", "pending", "under_review"].includes(status)) {
    return c.json({ error: "invalid status" }, 400);
  }

  await db
    .prepare("UPDATE package_version SET status = ? WHERE id = ?")
    .bind(status, versionId)
    .run();

  return c.json({ ok: true });
});

export { app as adminRouter };
