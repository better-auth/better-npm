import typosquats from "../../data/typosquats.json";

const blockedPackages = new Set<string>();
const typosquatOrigin = new Map<string, string>();

for (const [original, variants] of Object.entries(typosquats)) {
  for (const variant of variants) {
    blockedPackages.add(variant);
    typosquatOrigin.set(variant, original);
  }
}

export function isTyposquat(packageName: string): boolean {
  return blockedPackages.has(packageName);
}

export function getTyposquatOrigin(packageName: string): string | null {
  return typosquatOrigin.get(packageName) ?? null;
}
