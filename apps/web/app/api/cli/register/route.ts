import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8787";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawToken = "bnpm_" + crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  try {
    const res = await fetch(`${REGISTRY_URL}/api/internal/register-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        email: session.user.email,
        github_id: session.user.id,
        name: session.user.name,
        token_hash: tokenHash,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("register-token failed:", (data as any).error);
    }
  } catch (e) {
    console.error("register-token unreachable:", e);
  }

  return NextResponse.json({ token: rawToken, email: session.user.email });
}
