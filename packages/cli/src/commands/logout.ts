import * as p from "@clack/prompts";
import { removeToken, removeRegistry, getExistingToken, isRegistryConfigured } from "../config.js";

export async function logout() {
  p.intro("@better-npm/cli");

  const hasToken = !!getExistingToken();
  const hasRegistry = isRegistryConfigured();

  if (!hasToken && !hasRegistry) {
    p.outro("Nothing to do — better-npm is not configured.");
    return;
  }

  if (hasToken) {
    removeToken();
    p.log.success("Auth token removed.");
  }

  if (hasRegistry) {
    const remove = await p.confirm({
      message: "Also remove better-npm as your registry?",
      initialValue: false,
    });

    if (!p.isCancel(remove) && remove) {
      removeRegistry();
      p.outro("Registry removed. npm will use the default registry.");
      return;
    }
  }

  p.outro(hasToken ? "Signed out. Registry still active." : "Done.");
}
