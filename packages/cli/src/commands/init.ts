import * as p from "@clack/prompts";
import open from "open";
import {
  WEB_URL,
  isRegistryConfigured,
  writeRegistry,
  writeToken,
  ensureGitignore,
} from "../config.js";

const CLIENT_ID = "better-npm-cli";

export async function init() {
  p.intro("@better-npm/cli");

  if (isRegistryConfigured()) {
    p.note("Registry is already configured.", "Already set up");
    p.outro("Every npm install goes through better-npm.");
    return;
  }

  const scope = await p.select({
    message: "Where should better-npm be configured?",
    options: [
      { value: "global", label: "All projects", hint: "~/.npmrc" },
      { value: "local", label: "This project only", hint: ".npmrc in current directory" },
    ],
  });

  if (p.isCancel(scope)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  writeRegistry(scope as "global" | "local");

  if (scope === "local") {
    const added = ensureGitignore();
    if (added) {
      p.log.warn(".npmrc contains registry config — added it to .gitignore");
    }
  }

  p.note(
    "Every npm install now goes through better-npm",
    "You're all set",
  );

  const wantsLogin = await p.confirm({
    message: "Sign in with GitHub? (optional — enables install tracking & dashboard)",
    initialValue: true,
  });

  if (p.isCancel(wantsLogin) || !wantsLogin) {
    p.outro("Packages are vetted before they end up on your computer. Go build something.");
    return;
  }

  await login(scope as "global" | "local");
}

async function login(scope: "global" | "local") {
  const s = p.spinner();
  s.start("Connecting...");

  let codeRes: Response;
  try {
    codeRes = await fetch(`${WEB_URL}/api/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    });
  } catch {
    s.stop("Could not reach better-npm");
    p.log.warn("Sign in skipped — you can run `npx @better-npm/cli login` later.");
    return;
  }

  if (!codeRes.ok) {
    s.stop("Something went wrong");
    p.log.warn("Sign in skipped — you can run `npx @better-npm/cli login` later.");
    return;
  }

  const device: any = await codeRes.json();
  s.stop("Connected");

  p.note(`Code: ${device.user_code}`, "Confirm this code in your browser");

  const verificationUrl =
    device.verification_uri_complete || device.verification_uri;
  await open(verificationUrl);

  const pollSpinner = p.spinner();
  pollSpinner.start("Waiting for sign in...");

  const accessToken = await pollForToken(
    device.device_code,
    device.interval || 5,
    device.expires_in || 600,
  );

  if (!accessToken) {
    pollSpinner.stop("Timed out");
    p.log.warn("Sign in skipped — you can run `npx @better-npm/cli login` later.");
    return;
  }

  pollSpinner.stop("Signed in");

  const regSpinner = p.spinner();
  regSpinner.start("Setting up registry token...");

  const registryToken = await registerCliToken(accessToken);

  if (!registryToken) {
    regSpinner.stop("Could not register token");
    p.log.warn("Sign in skipped — you can run `npx @better-npm/cli login` later.");
    return;
  }

  writeToken(registryToken.token, scope);
  regSpinner.stop("Token configured");

  p.outro(`\x1b[32mLinked!\x1b[0m View your dashboard at \x1b[34;4mhttps://better-npm.com/dashboard\x1b[0m`);
}

async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<string | null> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollingInterval = interval;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollingInterval * 1000));

    let res: Response;
    try {
      res = await fetch(`${WEB_URL}/api/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: CLIENT_ID,
        }),
      });
    } catch {
      continue;
    }

    if (!res.ok) {
      const data: any = await res.json().catch(() => ({}));
      if (data.error === "slow_down") {
        pollingInterval += 5;
      } else if (data.error === "expired_token" || data.error === "access_denied") {
        return null;
      }
      continue;
    }

    const data: any = await res.json();
    if (data.access_token) return data.access_token;
  }

  return null;
}

async function registerCliToken(
  accessToken: string,
): Promise<{ token: string; email?: string } | null> {
  try {
    const res = await fetch(`${WEB_URL}/api/cli/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) return null;

    const data: any = await res.json();
    if (data.token) return { token: data.token, email: data.email };
  } catch {
    // ignore
  }

  return null;
}
