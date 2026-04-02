import * as p from "@clack/prompts";
import { removeToken, getExistingToken } from "../config.js";

export async function logout() {
  p.intro("better-npm");

  const existing = getExistingToken();
  if (!existing) {
    p.outro("Not connected to better-npm.");
    return;
  }

  removeToken();
  p.outro("Disconnected. npm will use the default registry.");
}
