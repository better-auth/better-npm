import { auth } from "./auth";
import { headers } from "next/headers";

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8787";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

export async function registryFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "X-Internal-Secret": INTERNAL_SECRET,
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Registry ${path} failed: ${res.status}`);
  return res.json();
}
