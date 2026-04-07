import type { Env } from "../types.js";

export function upstreamPackageUrl(env: Env, packageName: string): string {
  return `${env.UPSTREAM_REGISTRY}/${encodeURIComponent(packageName).replace("%40", "@")}`;
}

export async function fetchUpstreamMetadata(
  env: Env,
  packageName: string,
): Promise<any | null> {
  const url = upstreamPackageUrl(env, packageName);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchUpstreamVersionMetadata(
  env: Env,
  packageName: string,
  version: string,
): Promise<any | null> {
  const url = `${upstreamPackageUrl(env, packageName)}/${version}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchUpstreamTarball(
  env: Env,
  tarballUrl: string,
): Promise<Response | null> {
  const res = await fetch(tarballUrl);
  if (!res.ok) return null;
  return res;
}

export function rewriteTarballUrls(
  metadata: any,
  registryUrl: string,
): any {
  if (!metadata.versions) return metadata;

  for (const [, data] of Object.entries<any>(metadata.versions)) {
    if (data.dist?.tarball) {
      const upstreamUrl = new URL(data.dist.tarball);
      const filename = upstreamUrl.pathname.split("/").pop();
      data.dist.tarball = `${registryUrl}/${metadata.name}/-/${filename}`;
    }
  }

  return metadata;
}
