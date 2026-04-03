import { NextResponse } from "next/server";
import {
  forwardToRegistryDashboard,
  getSessionEmail,
} from "@/lib/registry-dashboard";

export async function GET(request: Request) {
  const email = await getSessionEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const qs = url.search;
  const res = await forwardToRegistryDashboard(`/packages${qs}`, email, {
    method: "GET",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
