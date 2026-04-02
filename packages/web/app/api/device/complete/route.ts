import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { completeDeviceSession } from "@/lib/device";

export async function POST(req: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userCode = (body as any).user_code;

  if (!userCode) {
    return NextResponse.json({ error: "missing user_code" }, { status: 400 });
  }

  const result = await completeDeviceSession(userCode, {
    email: session.user.email,
    githubId: session.user.id,
    name: session.user.name,
  });

  if ("error" in result) {
    const status = result.error === "expired" ? 410 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
