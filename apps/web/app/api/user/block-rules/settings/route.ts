import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await registryFetch(
    `/api/internal/user/settings?email=${encodeURIComponent(session.user.email)}`,
  );
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const data = await registryFetch("/api/internal/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      email: session.user.email,
    }),
  });

  return NextResponse.json(data);
}
