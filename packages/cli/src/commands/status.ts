import * as p from "@clack/prompts";
import { REGISTRY_URL, getExistingToken } from "../config.js";

export async function status() {
  p.intro("better-npm");

  const token = getExistingToken();
  if (!token) {
    p.outro("Not connected. Run `npx better-npm` to get started.");
    return;
  }

  const s = p.spinner();
  s.start("Checking status");

  const res = await fetch(`${REGISTRY_URL}/api/cli/status`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!res?.ok) {
    s.stop("Could not reach registry");
    p.outro("Check your connection.");
    return;
  }

  const data: any = await res.json();
  s.stop("Connected");

  p.note(
    `Email:        ${data.email}\nSubscription: ${data.subscription}\nToken:        ${token.slice(0, 8)}...`,
    "Status",
  );
  p.outro("Everything looks good.");
}
