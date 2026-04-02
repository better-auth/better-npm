import crypto from "crypto";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8787";

interface DeviceSession {
  deviceCode: string;
  userCode: string;
  scope: string;
  status: "pending" | "completed";
  token: string | null;
  email: string | null;
  createdAt: number;
}

const sessions = new Map<string, DeviceSession>();
const codeIndex = new Map<string, string>();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > 15 * 60 * 1000) {
      codeIndex.delete(s.userCode);
      sessions.delete(id);
    }
  }
}, 60_000);

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code.slice(0, 4) + "-" + code.slice(4);
}

function generateRawToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createDeviceSession(scope: string) {
  const deviceCode = crypto.randomUUID();
  const userCode = generateUserCode();

  const session: DeviceSession = {
    deviceCode,
    userCode,
    scope,
    status: "pending",
    token: null,
    email: null,
    createdAt: Date.now(),
  };

  sessions.set(deviceCode, session);
  codeIndex.set(userCode, deviceCode);

  return { deviceCode, userCode };
}

export function pollDeviceSession(deviceCode: string) {
  const session = sessions.get(deviceCode);
  if (!session) return { error: "not_found" as const };

  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    return { error: "expired" as const };
  }

  if (session.status === "completed" && session.token) {
    sessions.delete(deviceCode);
    codeIndex.delete(session.userCode);
    return { token: session.token };
  }

  return { pending: true };
}

export async function completeDeviceSession(
  userCode: string,
  user: { email: string; githubId: string; name?: string },
) {
  const deviceCode = codeIndex.get(userCode);
  if (!deviceCode) return { error: "invalid_code" };

  const session = sessions.get(deviceCode);
  if (!session || session.status !== "pending") return { error: "invalid_code" };

  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    return { error: "expired" };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const res = await fetch(`${REGISTRY_URL}/api/internal/register-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      github_id: user.githubId,
      name: user.name,
      token_hash: tokenHash,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: (data as any).error || "registry_error" };
  }

  session.status = "completed";
  session.token = rawToken;
  session.email = user.email;

  return { ok: true };
}
