import type { Finding } from "./analyze.js";

interface DepMeta {
  name: string;
  downloads: number;
  created: string | null;
}

const CONCURRENCY = 10;
const MIN_DOWNLOADS = 500;
const NEW_PACKAGE_DAYS = 30;

export async function checkNewDependencies(
  currentDeps: Record<string, string>,
  previousDeps: Record<string, string>,
): Promise<Finding[]> {
  const added = Object.keys(currentDeps).filter((d) => !(d in previousDeps));
  if (added.length === 0) return [];

  const metas = await pooled(added, CONCURRENCY, fetchDepMeta);
  const findings: Finding[] = [];

  for (const meta of metas) {
    if (!meta) continue;

    if (meta.downloads < MIN_DOWNLOADS) {
      findings.push({
        severity: "high",
        category: "suspicious-new-dep",
        message: `New dependency "${meta.name}" has very low weekly downloads (${meta.downloads.toLocaleString()})`,
      });
    }

    if (meta.created) {
      const age = (Date.now() - new Date(meta.created).getTime()) / 86_400_000;
      if (age < NEW_PACKAGE_DAYS) {
        findings.push({
          severity: "high",
          category: "suspicious-new-dep",
          message: `New dependency "${meta.name}" was created only ${Math.round(age)} days ago`,
        });
      }
    }
  }

  return findings;
}

async function fetchDepMeta(name: string): Promise<DepMeta | null> {
  try {
    const encoded = encodeURIComponent(name).replace("%40", "@");
    const [dlRes, pkgRes] = await Promise.all([
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encoded}`),
      fetch(`https://registry.npmjs.org/${encoded}`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    const downloads = dlRes.ok ? ((await dlRes.json()) as any).downloads || 0 : 0;
    let created: string | null = null;
    if (pkgRes.ok) {
      const pkg: any = await pkgRes.json();
      created = pkg.time?.created || null;
    }

    return { name, downloads, created };
  } catch {
    return null;
  }
}

async function pooled<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
