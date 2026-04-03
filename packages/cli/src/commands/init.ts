import * as p from "@clack/prompts";
import open from "open";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import {
  WEB_URL,
  REGISTRY_URL,
  getExistingToken,
  writeToken,
} from "../config.js";

const CLI_CLIENT_ID = "better-npm-cli";

export async function init() {
  p.intro("better-npm");

  const existing = getExistingToken();
  if (existing) {
    const res = await fetch(`${REGISTRY_URL}/api/cli/status`, {
      headers: { Authorization: `Bearer ${existing}` },
    }).catch(() => null);

    if (res?.ok) {
      const data = (await res.json()) as {
        email: string;
        subscription: string;
      };
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

  const authClient = createAuthClient({
    baseURL: WEB_URL,
    plugins: [deviceAuthorizationClient()],
  });

  const s = p.spinner();
  s.start("Connecting to better-npm");

  const codeResult = await authClient.device.code({
    client_id: CLI_CLIENT_ID,
    scope: "openid profile email",
  });

  if (codeResult.error || !codeResult.data) {
    s.stop("Something went wrong");
    p.cancel(
      codeResult.error?.error_description ||
        "Could not start device login. Try again.",
    );
    process.exit(1);
  }

  const {
    device_code,
    user_code,
    verification_uri,
    verification_uri_complete,
    expires_in: expiresInRaw = 1800,
    interval: intervalRaw = 5,
  } = codeResult.data;

  const expires_in = Number(expiresInRaw);
  const interval = Number(intervalRaw);

  s.stop("Connected");

  p.note(
    `Code: ${user_code}`,
    "Confirm this code in your browser",
  );

  const confirm = await p.confirm({
    message: "Open browser to sign in with GitHub?",
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const openUrl = verification_uri_complete || verification_uri;
  await open(openUrl);

  const pollSpinner = p.spinner();
  pollSpinner.start("Waiting for sign in...");

  const accessToken = await pollForDeviceAccessToken(
    authClient,
    device_code,
    interval,
    (Number.isFinite(expires_in) ? expires_in : 1800) * 1000,
  );

  if (!accessToken) {
    pollSpinner.stop("Timed out");
    p.cancel("Run `npx better-npm` to try again.");
    process.exit(1);
  }

  let registryRes: Response;
  try {
    registryRes = await fetch(`${WEB_URL}/api/cli/registry-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    pollSpinner.stop("Network error");
    p.cancel("Could not reach better-npm to finish setup.");
    process.exit(1);
  }

  if (!registryRes.ok) {
    pollSpinner.stop("Setup failed");
    const err = await registryRes.json().catch(() => ({}));
    p.cancel(
      (err as { error?: string }).error ||
        "Could not create registry token. Try again.",
    );
    process.exit(1);
  }

  const { token: registryToken } = (await registryRes.json()) as {
    token: string;
  };

  pollSpinner.stop("Signed in");

  writeToken(registryToken, scope as "local" | "global");

  const target = scope === "global" ? "~/.npmrc" : "./.npmrc";
  const msg =
    scope === "local"
      ? `Token written to ${target}\nMake sure to add .npmrc to .gitignore`
      : `Token written to ${target}\nEvery npm install now goes through better-npm`;

  p.note(msg, "You're all set");
  p.outro("Packages are reviewed before they reach you. Go build something.");
}

async function pollForDeviceAccessToken(
  authClient: ReturnType<typeof createAuthClient>,
  deviceCode: string,
  intervalSec: number,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();
  let pollingIntervalSec = Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 5;

  while (Date.now() - start < timeoutMs) {
    await sleep(pollingIntervalSec * 1000);

    const { data, error } = await authClient.device.token({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: CLI_CLIENT_ID,
    });

    if (data?.access_token) {
      return data.access_token;
    }

    if (!error) continue;

    switch (error.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        pollingIntervalSec += 5;
        break;
      case "access_denied":
        return null;
      case "expired_token":
        return null;
      default:
        return null;
    }
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
