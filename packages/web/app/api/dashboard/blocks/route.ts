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
  const res = await forwardToRegistryDashboard("/blocks", email, {
    method: "GET",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const email = await getSessionEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.text();
  const res = await forwardToRegistryDashboard("/blocks", email, {
    method: "POST",
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request: Request) {
  const email = await getSessionEmail(request);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const qs = url.search;
  const res = await forwardToRegistryDashboard(`/blocks${qs}`, email, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
