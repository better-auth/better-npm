import { NextResponse } from "next/server";
import { createDeviceSession, pollDeviceSession } from "@/lib/device";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const scope = (body as any).scope || "global";

  const { deviceCode, userCode } = createDeviceSession(scope);

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/auth/device?code=${userCode}`;

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_url: verificationUrl,
    expires_in: 600,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceCode = searchParams.get("device_code");

  if (!deviceCode) {
    return NextResponse.json({ error: "missing device_code" }, { status: 400 });
  }

  const result = pollDeviceSession(deviceCode);

  if ("error" in result) {
    const status = result.error === "expired" ? 410 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  if ("token" in result) {
    return NextResponse.json({ token: result.token });
  }

  return NextResponse.json({ status: "pending" }, { status: 202 });
}
