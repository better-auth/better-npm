import * as p from "@clack/prompts";
import open from "open";
import {
  WEB_URL,
  REGISTRY_URL,
  getExistingToken,
  writeToken,
} from "../config.js";

export async function init() {
  p.intro("better-npm");

  const existing = getExistingToken();
  if (existing) {
    const res = await fetch(`${REGISTRY_URL}/api/cli/status`, {
      headers: { Authorization: `Bearer ${existing}` },
    }).catch(() => null);

    if (res?.ok) {
      const data: any = await res.json();
      p.note(
        `Email: ${data.email}\nSubscription: ${data.subscription}`,
        "Already set up",
      );
      p.outro("Run `npx better-npm logout` to disconnect.");
      return;
    }
  }

  const scope = await p.select({
    message: "Where should better-npm be configured?",
    options: [
      { value: "local", label: "This project", hint: ".npmrc in current directory" },
      { value: "global", label: "All projects", hint: "~/.npmrc — applies everywhere" },
    ],
  });

  if (p.isCancel(scope)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Connecting to better-npm");

  let deviceRes: Response;
  try {
    deviceRes = await fetch(`${WEB_URL}/api/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
  } catch {
    s.stop("Could not reach better-npm");
    p.cancel("Check your connection and try again.");
    process.exit(1);
  }

  if (!deviceRes.ok) {
    s.stop("Something went wrong");
    p.cancel("Try again.");
    process.exit(1);
  }

  const device: any = await deviceRes.json();
  s.stop("Connected");

  p.note(
    `Code: ${device.user_code}`,
    "Confirm this code in your browser",
  );

  const confirm = await p.confirm({
    message: "Open browser to sign in with GitHub?",
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  await open(device.verification_url);

  const pollSpinner = p.spinner();
  pollSpinner.start("Waiting for sign in...");

  const token = await pollForToken(device.device_code, device.expires_in * 1000);

  if (!token) {
    pollSpinner.stop("Timed out");
    p.cancel("Run `npx better-npm` to try again.");
    process.exit(1);
  }

  pollSpinner.stop("Signed in");

  writeToken(token, scope as "local" | "global");

  const target = scope === "global" ? "~/.npmrc" : "./.npmrc";
  const msg =
    scope === "local"
      ? `Token written to ${target}\nMake sure to add .npmrc to .gitignore`
      : `Token written to ${target}\nEvery npm install now goes through better-npm`;

  p.note(msg, "You're all set");
  p.outro("Packages are reviewed before they reach you. Go build something.");
}

async function pollForToken(
  deviceCode: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await sleep(2000);

    const res = await fetch(
      `${WEB_URL}/api/device?device_code=${deviceCode}`,
    ).catch(() => null);

    if (!res) continue;

    if (res.status === 410) return null;
    if (!res.ok) continue;

    const data: any = await res.json();
    if (data.token) return data.token;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
