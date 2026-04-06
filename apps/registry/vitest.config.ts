import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
			miniflare: {
				bindings: {
					INTERNAL_SECRET: "test-secret",
					OPENROUTER_API_KEY: "test-key-for-vitest",
					REGISTRY_URL: "https://registry.better-npm.test",
				},
			},
		}),
	],
});
