import type { Env, ReviewMessage } from "../types.js";
import {
  getAllKnownVersions,
  upsertPackage,
  insertVersion,
} from "../db/queries.js";
import { processReviewInline } from "../review/consumer.js";

const BATCH_SIZE = 50;

export async function syncFromChangesFeed(env: Env): Promise<void> {
  const offset = await getOffset(env.DB);

  const tracked = await env.DB.prepare(
    "SELECT id, name, latest_known FROM package ORDER BY name LIMIT ? OFFSET ?",
  )
    .bind(BATCH_SIZE, offset)
    .all<{ id: string; name: string; latest_known: string | null }>();

  if (tracked.results.length === 0) {
    // Wrapped around — reset offset
    await setOffset(env.DB, 0);
    return;
  }

  await setOffset(env.DB, offset + tracked.results.length);

  let newVersions = 0;

  for (const pkg of tracked.results) {
    try {
      const url = `${env.UPSTREAM_REGISTRY}/${encodeURIComponent(pkg.name).replace("%40", "@")}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;

      const metadata: any = await res.json();
      if (!metadata.versions) continue;

      const latest = metadata["dist-tags"]?.latest;
      if (latest && latest === pkg.latest_known) continue;

      const knownVersions = await getAllKnownVersions(env.DB, pkg.id);
      const knownSet = new Set(knownVersions.map((v) => v.version));

      for (const [ver, versionData] of Object.entries<any>(
        metadata.versions,
      )) {
        if (knownSet.has(ver)) continue;

        const versionId = crypto.randomUUID();

        await insertVersion(env.DB, {
          id: versionId,
          packageId: pkg.id,
          version: ver,
          tarballSha: versionData.dist?.shasum || "",
          status: "pending",
        });

        const message: ReviewMessage = {
          packageVersionId: versionId,
          packageName: pkg.name,
          version: ver,
        };

        if (env.REVIEW_QUEUE) {
          await env.REVIEW_QUEUE.send(message);
        } else {
          await processReviewInline(env, message);
        }

        newVersions++;
      }

      await upsertPackage(env.DB, {
        id: pkg.id,
        name: pkg.name,
        description: metadata.description,
        distTags: JSON.stringify(metadata["dist-tags"] || {}),
        latestKnown: latest || pkg.latest_known || undefined,
      });
    } catch (err) {
      console.error(`[sync] Error checking ${pkg.name}:`, err);
    }
  }

  if (newVersions > 0) {
    console.log(
      `[sync] Checked ${tracked.results.length} packages, ${newVersions} new version(s) queued for review`,
    );
  }
}

async function getOffset(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT last_seq FROM sync_state WHERE id = 'main'")
    .first<{ last_seq: string }>();
  return parseInt(row?.last_seq || "0", 10);
}

async function setOffset(db: D1Database, offset: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_state (id, last_seq, updated_at)
       VALUES ('main', ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
    )
    .bind(String(offset), Date.now())
    .run();
}
