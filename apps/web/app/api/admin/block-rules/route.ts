import { requireAdmin } from "@/lib/admin";
import { registryFetch } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await registryFetch("/api/internal/admin/block-rules");
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const data = await registryFetch("/api/internal/admin/block-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      created_by: session.user.email,
    }),
  });

  return NextResponse.json(data);
}
