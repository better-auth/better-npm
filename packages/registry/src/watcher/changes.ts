import type { Env, ReviewMessage } from "../types.js";
import {
  getPackageByName,
  getAllKnownVersions,
  upsertPackage,
  insertVersion,
  getLastSeq,
  setLastSeq,
  getAllTrackedPackageNames,
} from "../db/queries.js";
import { processReviewInline } from "../review/consumer.js";

const CHANGES_URL = "https://replicate.npmjs.com/_changes";
const BATCH_LIMIT = 100;

/**
 * Called by the cron trigger every minute.
 * Reads the npm CouchDB changes feed from our last known sequence,
 * filters to packages we track, and queues new versions for review.
 */
export async function syncFromChangesFeed(env: Env): Promise<void> {
  const lastSeq = await getLastSeq(env.DB);
  const trackedNames = new Set(await getAllTrackedPackageNames(env.DB));

  if (trackedNames.size === 0) {
    console.log("[sync] No tracked packages, skipping");
    return;
  }

  const url = `${CHANGES_URL}?since=${encodeURIComponent(lastSeq)}&limit=${BATCH_LIMIT}&include_docs=false`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    console.error(`[sync] Changes feed returned ${res.status}`);
    return;
  }

  const data: any = await res.json();
  const results = data.results || [];

  if (results.length === 0) return;

  let newVersionCount = 0;

  for (const change of results) {
    const packageName = change.id;

    // Skip design docs and packages we don't track
    if (packageName.startsWith("_design/")) continue;
    if (!trackedNames.has(packageName)) continue;

    // A change happened to a tracked package — fetch its latest metadata
    const metaRes = await fetch(
      `${env.UPSTREAM_REGISTRY}/${encodeURIComponent(packageName).replace("%40", "@")}`,
      { headers: { Accept: "application/json" } },
    );
    if (!metaRes.ok) continue;

    const metadata: any = await metaRes.json();
    if (!metadata.versions) continue;

    const pkg = await getPackageByName(env.DB, packageName);
    if (!pkg) continue;

    const knownVersions = await getAllKnownVersions(env.DB, pkg.id);
    const knownSet = new Set(knownVersions.map((v) => v.version));

    for (const [ver, versionData] of Object.entries<any>(metadata.versions)) {
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
        packageName,
        version: ver,
      };

      if (env.REVIEW_QUEUE) {
        await env.REVIEW_QUEUE.send(message);
      } else {
        await processReviewInline(env, message);
      }

      newVersionCount++;
    }

    // Update the package's dist-tags
    await upsertPackage(env.DB, {
      id: pkg.id,
      name: packageName,
      description: metadata.description,
      distTags: JSON.stringify(metadata["dist-tags"] || {}),
      latestKnown: metadata["dist-tags"]?.latest || pkg.latest_known || undefined,
    });
  }

  // Save the sequence cursor so we resume from here next time
  if (data.last_seq) {
    await setLastSeq(env.DB, String(data.last_seq));
  }

  if (newVersionCount > 0) {
    console.log(
      `[sync] Processed ${results.length} changes, queued ${newVersionCount} new version(s) for review`,
    );
  }
}
