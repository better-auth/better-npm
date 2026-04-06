import { requireAdmin } from "@/lib/admin";
import { registryFetch } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();

  await registryFetch(`/api/internal/admin/versions/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  return NextResponse.json({ ok: true });
}
