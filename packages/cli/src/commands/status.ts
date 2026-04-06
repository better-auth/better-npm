import * as p from "@clack/prompts";
import { REGISTRY_URL, isRegistryConfigured, getExistingToken } from "../config.js";

export async function status() {
  p.intro("@better-npm/cli");

  if (!isRegistryConfigured()) {
    p.outro("Not configured. Run `npx @better-npm/cli` to get started.");
    return;
  }

  const s = p.spinner();
  s.start("Checking registry");

  const healthOk = await fetch(`${REGISTRY_URL}/`)
    .then((r) => r.ok)
    .catch(() => false);

  if (!healthOk) {
    s.stop("Could not reach registry");
    p.outro("Check your connection.");
    return;
  }

  s.stop("Registry reachable");

  const token = getExistingToken();

  if (token) {
    const res = await fetch(`${REGISTRY_URL}/api/cli/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);

    if (res?.ok) {
      const data: any = await res.json();
      p.note(
        `Registry: ${REGISTRY_URL}\nEmail:    ${data.email}\nToken:    ${token.slice(0, 12)}...`,
        "Status",
      );
    } else {
      p.note(
        `Registry: ${REGISTRY_URL}\nAuth:     token invalid or expired`,
        "Status",
      );
    }
  } else {
    p.note(
      `Registry: ${REGISTRY_URL}\nAuth:     not signed in (optional)`,
      "Status",
    );
  }

  p.outro("Packages are screened before they end up in your node_modules.");
}
