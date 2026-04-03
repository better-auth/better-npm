/** Parse npm tarball filename: `{unscopedName}-{version}.tgz` */
export function parseTarballVersion(
  filename: string,
  unscopedPackageName: string,
): string | null {
  const base = filename.endsWith(".tgz") ? filename.slice(0, -4) : filename;
  const prefix = `${unscopedPackageName}-`;
  if (!base.startsWith(prefix) || base.length <= prefix.length) {
    return null;
  }
  return base.slice(prefix.length) || null;
}

export function parseBlockRows(rows: { version: string }[]): {
  blockAll: boolean;
  blockedVersions: Set<string>;
} {
  let blockAll = false;
  const blockedVersions = new Set<string>();
  for (const r of rows) {
    if (r.version === "*") blockAll = true;
    else blockedVersions.add(r.version);
  }
  return { blockAll, blockedVersions };
}

export function stripBlockedVersions(
  upstream: {
    versions?: Record<string, unknown>;
    "dist-tags"?: Record<string, string>;
  },
  blockedVersions: Set<string>,
): void {
  if (!upstream.versions) return;
  for (const v of blockedVersions) {
    delete upstream.versions[v];
  }
  const available = new Set(Object.keys(upstream.versions));
  if (upstream["dist-tags"]) {
    const tags = upstream["dist-tags"];
    for (const tag of Object.keys(tags)) {
      const ver = tags[tag];
      if (!available.has(ver)) {
        const keys = Array.from(available);
        const fallback =
          keys.length > 0 ? keys[keys.length - 1]! : null;
        if (fallback) tags[tag] = fallback;
        else delete tags[tag];
      }
    }
  }
}

export function isCustomerBlocked(
  blockAll: boolean,
  blockedVersions: Set<string>,
  version: string | null,
): boolean {
  if (blockAll) return true;
  if (version != null && blockedVersions.has(version)) return true;
  return false;
}
