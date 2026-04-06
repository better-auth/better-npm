import { requireAdmin } from "@/lib/admin";
import { registryFetch } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await registryFetch(`/api/internal/admin/block-rules/${id}`, {
    method: "DELETE",
  });

  return NextResponse.json(data);
}
