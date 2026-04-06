/**
 * Discover new typosquats on npm and add them to data/typosquats.json.
 *
 * The JSON is bundled into the worker at build time — no sync step needed.
 * Just merge changes to the JSON and redeploy.
 *
 * Usage:
 *   npx tsx scripts/sync-blocklist.ts              # all packages in JSON
 *   npx tsx scripts/sync-blocklist.ts react vue     # specific packages
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, "../data/typosquats.json");
const CONCURRENCY = 20;

function generateVariants(name: string): string[] {
  const variants = new Set<string>();
  if (name.length < 3) return [];

  for (let i = 0; i < name.length; i++) {
    if (name[i] === "-" || name[i] === ".") continue;
    variants.add(name.slice(0, i) + name.slice(i + 1));
  }

  for (let i = 0; i < name.length - 1; i++) {
    if (name[i] === name[i + 1]) continue;
    const chars = name.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    variants.add(chars.join(""));
  }

  for (let i = 0; i < name.length; i++) {
    if (name[i] === "-" || name[i] === ".") continue;
    variants.add(name.slice(0, i) + name[i] + name.slice(i));
  }

  const subs: Record<string, string[]> = {
    a: ["4", "e"], e: ["3", "a"], i: ["1", "l"], l: ["1", "i"],
    o: ["0"], s: ["5", "z"], t: ["7"], g: ["9", "q"],
    n: ["m"], m: ["n"], b: ["d"], d: ["b"], u: ["v"], v: ["u"],
  };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i].toLowerCase();
    if (subs[ch]) {
      for (const r of subs[ch]) {
        variants.add(name.slice(0, i) + r + name.slice(i + 1));
      }
    }
  }

  if (name.includes("-")) {
    variants.add(name.replace(/-/g, ""));
    variants.add(name.replace(/-/g, "."));
    variants.add(name.replace(/-/g, "_"));
  } else if (name.length > 5) {
    for (let i = 2; i < name.length - 2; i++) {
      variants.add(name.slice(0, i) + "-" + name.slice(i));
    }
  }

  if (!name.startsWith("@")) {
    variants.add(`${name}-js`);
    variants.add(`${name}js`);
    variants.add(`${name}-node`);
  }

  variants.delete(name);
  return [...variants];
}

type Blocklist = Record<string, string[]>;

function readBlocklist(): Blocklist {
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

function writeBlocklist(data: Blocklist): void {
  const sorted: Blocklist = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = [...new Set(data[key])].sort();
  }
  writeFileSync(DATA_FILE, JSON.stringify(sorted, null, 2) + "\n");
}

async function packageExists(name: string): Promise<boolean> {
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`;
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
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

const packages = process.argv.slice(2);
const targets = packages.length > 0 ? packages : Object.keys(readBlocklist());

const data = readBlocklist();
const allKnown = new Set(Object.values(data).flat());

console.log(`\n  Generating typosquat variants for ${targets.length} packages...\n`);

const candidates: { original: string; variant: string }[] = [];
for (const pkg of targets) {
  for (const v of generateVariants(pkg)) {
    if (allKnown.has(v) || targets.includes(v)) continue;
    candidates.push({ original: pkg, variant: v });
  }
}

const seen = new Set<string>();
const unique = candidates.filter((c) => {
  if (seen.has(c.variant)) return false;
  seen.add(c.variant);
  return true;
});

console.log(`  ${unique.length} new variants to check on npm\n`);

let checked = 0;
const results = await pooled(unique, CONCURRENCY, async (item) => {
  const exists = await packageExists(item.variant);
  checked++;
  if (checked % 100 === 0) process.stdout.write(`  Checked ${checked}/${unique.length}\r`);
  return { ...item, exists };
});

const found = results.filter((r) => r.exists);
console.log(`\n  Found ${found.length} new typosquat candidates that exist on npm\n`);

if (found.length === 0) {
  console.log("  Nothing new to add.\n");
  process.exit(0);
}

for (const { original, variant } of found) {
  if (!data[original]) data[original] = [];
  data[original].push(variant);
  console.log(`    + ${variant}  (typosquat of ${original})`);
}

writeBlocklist(data);
console.log(`\n  Updated data/typosquats.json (${Object.values(data).flat().length} total entries)\n`);
