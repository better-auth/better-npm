import { auth } from "@/lib/auth";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8787";

export async function getSessionEmail(
  request: Request,
): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email;
  return email?.trim() || null;
}

export async function forwardToRegistryDashboard(
  path: string,
  email: string,
  init: RequestInit = {},
): Promise<Response> {
  const secret = process.env.REGISTRY_INTERNAL_SECRET;
  if (!secret) {
    return Response.json(
      { error: "REGISTRY_INTERNAL_SECRET is not configured" },
      { status: 503 },
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("X-Customer-Email", email);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${REGISTRY_URL}/api/internal/dashboard${path}`, {
    ...init,
    headers,
  });
}
