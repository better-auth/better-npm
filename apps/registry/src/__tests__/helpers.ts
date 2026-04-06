export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS package (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  dist_tags TEXT,
  latest_known TEXT,
  weekly_downloads INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS package_version (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES package(id),
  version TEXT NOT NULL,
  tarball_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE(package_id, version)
);

CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY,
  package_version_id TEXT NOT NULL REFERENCES package_version(id),
  reviewer_type TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score REAL,
  findings TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  last_seq TEXT NOT NULL DEFAULT '0',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  github_id TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS token (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS cli_session (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT,
  user_code TEXT,
  device_type TEXT DEFAULT 'email',
  scope TEXT DEFAULT 'global',
  token TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS install (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  customer_id TEXT,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  version_status TEXT NOT NULL DEFAULT 'unreviewed',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS block_rule (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  version_pattern TEXT NOT NULL DEFAULT '*',
  reason TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_block_rule (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  version_pattern TEXT NOT NULL DEFAULT '*',
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  min_weekly_downloads INTEGER
);

CREATE INDEX IF NOT EXISTS idx_package_name ON package(name);
CREATE INDEX IF NOT EXISTS idx_version_package ON package_version(package_id);
CREATE INDEX IF NOT EXISTS idx_version_status ON package_version(status);
CREATE INDEX IF NOT EXISTS idx_review_status ON review(status);
CREATE INDEX IF NOT EXISTS idx_customer_email ON customer(email);
CREATE INDEX IF NOT EXISTS idx_token_hash ON token(token_hash);
CREATE INDEX IF NOT EXISTS idx_install_package ON install(package_name);
CREATE INDEX IF NOT EXISTS idx_install_created ON install(created_at);
CREATE INDEX IF NOT EXISTS idx_install_customer ON install(customer_id);
CREATE INDEX IF NOT EXISTS idx_block_rule_package ON block_rule(package_name);
CREATE INDEX IF NOT EXISTS idx_user_block_rule_customer_package ON user_block_rule(customer_id, package_name);
`;

export async function runMigrations(db: D1Database) {
	const statements = MIGRATION_SQL.trim()
		.split(/;\s*\n/)
		.map((s) => s.trim())
		.filter(Boolean);
	const batch = statements.map((s) => db.prepare(s));
	await db.batch(batch);
}

export async function createCustomer(
	db: D1Database,
	opts: { email: string; githubId: string; name?: string },
) {
	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			"INSERT INTO customer (id, email, github_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.bind(id, opts.email, opts.githubId, opts.name || null, now, now)
		.run();
	return id;
}

export async function createToken(
	db: D1Database,
	opts: { customerId: string; tokenHash: string },
) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO token (id, customer_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
		)
		.bind(id, opts.customerId, opts.tokenHash, Date.now())
		.run();
	return id;
}

export async function createPackage(
	db: D1Database,
	opts: {
		name: string;
		weeklyDownloads?: number;
		latestKnown?: string;
		description?: string;
	},
) {
	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			"INSERT INTO package (id, name, description, latest_known, weekly_downloads, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(
			id,
			opts.name,
			opts.description || null,
			opts.latestKnown || null,
			opts.weeklyDownloads || 0,
			now,
			now,
		)
		.run();
	return id;
}

export async function createPackageVersion(
	db: D1Database,
	opts: {
		packageId: string;
		version: string;
		status?: string;
		tarballSha?: string;
	},
) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO package_version (id, package_id, version, tarball_sha, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.bind(
			id,
			opts.packageId,
			opts.version,
			opts.tarballSha || "sha-test",
			opts.status || "approved",
			Date.now(),
		)
		.run();
	return id;
}

export async function createBlockRule(
	db: D1Database,
	opts: {
		packageName: string;
		versionPattern?: string;
		reason?: string;
	},
) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO block_rule (id, package_name, version_pattern, reason, created_at) VALUES (?, ?, ?, ?, ?)",
		)
		.bind(
			id,
			opts.packageName,
			opts.versionPattern || "*",
			opts.reason || null,
			Date.now(),
		)
		.run();
	return id;
}

export async function createUserBlockRule(
	db: D1Database,
	opts: {
		customerId: string;
		packageName: string;
		versionPattern?: string;
	},
) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO user_block_rule (id, customer_id, package_name, version_pattern, created_at) VALUES (?, ?, ?, ?, ?)",
		)
		.bind(
			id,
			opts.customerId,
			opts.packageName,
			opts.versionPattern || "*",
			Date.now(),
		)
		.run();
	return id;
}

export function makeNpmMetadata(
	name: string,
	versions: string[],
) {
	const versionsObj: Record<string, any> = {};
	for (const v of versions) {
		versionsObj[v] = {
			name,
			version: v,
			dist: {
				tarball: `https://registry.npmjs.org/${name}/-/${name}-${v}.tgz`,
				shasum: `sha-${v}`,
			},
			dependencies: {},
		};
	}
	return {
		name,
		description: `${name} package`,
		versions: versionsObj,
		"dist-tags": { latest: versions[versions.length - 1] },
		time: {
			created: "2020-01-01T00:00:00Z",
			...Object.fromEntries(
				versions.map((v) => [v, "2024-01-01T00:00:00Z"]),
			),
		},
		maintainers: [{ name: "maintainer", email: "m@test.com" }],
	};
}

export function mockUpstreamFetch(
	mocks: Map<string, { status: number; body: string }>,
) {
	const originalFetch = globalThis.fetch;
	return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input as any, init);
		const url = new URL(request.url);
		const key = `${url.origin}${url.pathname}`;

		const mock = mocks.get(key);
		if (mock) {
			return new Response(mock.body, {
				status: mock.status,
				headers: { "content-type": "application/json" },
			});
		}

		if (
			url.hostname === "registry.npmjs.org" ||
			url.hostname === "api.npmjs.org"
		) {
			return new Response(JSON.stringify({ error: "not found" }), {
				status: 404,
			});
		}

		return originalFetch(input as any, init);
	});
}

import { vi } from "vitest";
