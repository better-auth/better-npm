import { describe, it, expect } from "vitest";
import { rewriteTarballUrls } from "../registry/upstream.js";
import { isTyposquat, getTyposquatOrigin } from "../registry/blocklist.js";

describe("rewriteTarballUrls", () => {
	it("rewrites tarball URLs to the registry URL", () => {
		const metadata = {
			name: "express",
			versions: {
				"4.18.0": {
					dist: {
						tarball:
							"https://registry.npmjs.org/express/-/express-4.18.0.tgz",
					},
				},
				"4.19.0": {
					dist: {
						tarball:
							"https://registry.npmjs.org/express/-/express-4.19.0.tgz",
					},
				},
			},
		};

		const result = rewriteTarballUrls(
			metadata,
			"https://registry.better-npm.dev",
		);

		expect(result.versions["4.18.0"].dist.tarball).toBe(
			"https://registry.better-npm.dev/express/-/express-4.18.0.tgz",
		);
		expect(result.versions["4.19.0"].dist.tarball).toBe(
			"https://registry.better-npm.dev/express/-/express-4.19.0.tgz",
		);
	});

	it("handles scoped packages", () => {
		const metadata = {
			name: "@types/node",
			versions: {
				"20.0.0": {
					dist: {
						tarball:
							"https://registry.npmjs.org/@types/node/-/node-20.0.0.tgz",
					},
				},
			},
		};

		const result = rewriteTarballUrls(metadata, "https://r.test.dev");
		expect(result.versions["20.0.0"].dist.tarball).toBe(
			"https://r.test.dev/@types/node/-/node-20.0.0.tgz",
		);
	});

	it("returns metadata unchanged when no versions key", () => {
		const metadata = { name: "empty-pkg" };
		const result = rewriteTarballUrls(metadata, "https://r.test.dev");
		expect(result).toEqual({ name: "empty-pkg" });
	});

	it("skips versions without dist.tarball", () => {
		const metadata = {
			name: "partial",
			versions: {
				"1.0.0": { description: "no dist field" },
				"2.0.0": {
					dist: {
						tarball:
							"https://registry.npmjs.org/partial/-/partial-2.0.0.tgz",
					},
				},
			},
		};

		const result = rewriteTarballUrls(metadata, "https://r.test.dev");
		expect(result.versions["1.0.0"].description).toBe("no dist field");
		expect(result.versions["2.0.0"].dist.tarball).toBe(
			"https://r.test.dev/partial/-/partial-2.0.0.tgz",
		);
	});

	it("preserves non-tarball metadata fields", () => {
		const metadata = {
			name: "test-pkg",
			description: "A test package",
			"dist-tags": { latest: "1.0.0" },
			versions: {
				"1.0.0": {
					name: "test-pkg",
					version: "1.0.0",
					dependencies: { lodash: "^4.0.0" },
					dist: {
						tarball:
							"https://registry.npmjs.org/test-pkg/-/test-pkg-1.0.0.tgz",
						shasum: "abc123",
					},
				},
			},
		};

		const result = rewriteTarballUrls(metadata, "https://r.test.dev");
		expect(result.description).toBe("A test package");
		expect(result["dist-tags"].latest).toBe("1.0.0");
		expect(result.versions["1.0.0"].dependencies).toEqual({
			lodash: "^4.0.0",
		});
		expect(result.versions["1.0.0"].dist.shasum).toBe("abc123");
	});
});

describe("blocklist", () => {
	describe("isTyposquat", () => {
		it("returns true for known typosquats", () => {
			expect(isTyposquat("aj")).toBe(true);
			expect(isTyposquat("angula")).toBe(true);
			expect(isTyposquat("auto-prefixer")).toBe(true);
		});

		it("returns false for legitimate packages", () => {
			expect(isTyposquat("express")).toBe(false);
			expect(isTyposquat("react")).toBe(false);
			expect(isTyposquat("ajv")).toBe(false);
			expect(isTyposquat("angular")).toBe(false);
		});

		it("returns false for unknown packages", () => {
			expect(isTyposquat("my-totally-unique-package-12345")).toBe(false);
		});
	});

	describe("getTyposquatOrigin", () => {
		it("returns the original package for a typosquat", () => {
			expect(getTyposquatOrigin("aj")).toBe("ajv");
			expect(getTyposquatOrigin("angula")).toBe("angular");
			expect(getTyposquatOrigin("auto-prefixer")).toBe("autoprefixer");
		});

		it("returns null for non-typosquat packages", () => {
			expect(getTyposquatOrigin("express")).toBeNull();
			expect(getTyposquatOrigin("react")).toBeNull();
			expect(getTyposquatOrigin("ajv")).toBeNull();
		});
	});
});
