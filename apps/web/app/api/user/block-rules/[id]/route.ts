import { auth } from "@/lib/auth";
import { registryFetch } from "@/lib/admin";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await registryFetch(
    `/api/internal/user/block-rules/${id}?email=${encodeURIComponent(session.user.email)}`,
    { method: "DELETE" },
  );

  return NextResponse.json(data);
}
