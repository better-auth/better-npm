import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8787";

function generateRawToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
  );
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Device flow returns access_token = DB session token. Better Auth's getSession()
 * only reads the session cookie, not Bearer — resolve via internalAdapter.findSession.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!bearer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findSession(bearer);

  if (!found || found.session.expiresAt < new Date()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = found.user.email;
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const res = await fetch(`${REGISTRY_URL}/api/internal/register-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      github_id: found.user.id,
      name: found.user.name ?? undefined,
      token_hash: tokenHash,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (data as { error?: string }).error || "registry_error" },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({ token: rawToken });
}
