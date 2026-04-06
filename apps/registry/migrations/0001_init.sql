-- Tracked packages (ones we monitor for new versions)
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

-- Individual versions and their review status
CREATE TABLE IF NOT EXISTS package_version (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES package(id),
  version TEXT NOT NULL,
  tarball_sha TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE(package_id, version)
);

-- Review results (AI and human)
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

-- Cursor for the npm changes feed
CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  last_seq TEXT NOT NULL DEFAULT '0',
  updated_at INTEGER NOT NULL
);

-- Customers (authenticated users)
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  github_id TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Registry tokens (one per login, linked to customer)
CREATE TABLE IF NOT EXISTS token (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- CLI sessions (temporary, for the login flow)
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

-- Tarball download tracking
CREATE TABLE IF NOT EXISTS install (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  customer_id TEXT,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  version_status TEXT NOT NULL DEFAULT 'unreviewed',
  created_at INTEGER NOT NULL
);

-- Admin block rules (typosquats, malicious packages)
CREATE TABLE IF NOT EXISTS block_rule (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  version_pattern TEXT NOT NULL DEFAULT '*',
  reason TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

-- User-scoped block rules
CREATE TABLE IF NOT EXISTS user_block_rule (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  version_pattern TEXT NOT NULL DEFAULT '*',
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  min_weekly_downloads INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_package_name ON package(name);
CREATE INDEX IF NOT EXISTS idx_version_package ON package_version(package_id);
CREATE INDEX IF NOT EXISTS idx_version_status ON package_version(status);
CREATE INDEX IF NOT EXISTS idx_review_status ON review(status);
CREATE INDEX IF NOT EXISTS idx_customer_email ON customer(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_github_id ON customer(github_id);
CREATE INDEX IF NOT EXISTS idx_token_hash ON token(token_hash);
CREATE INDEX IF NOT EXISTS idx_session_id ON cli_session(id);
CREATE INDEX IF NOT EXISTS idx_session_user_code ON cli_session(user_code);
CREATE INDEX IF NOT EXISTS idx_install_package ON install(package_name);
CREATE INDEX IF NOT EXISTS idx_install_created ON install(created_at);
CREATE INDEX IF NOT EXISTS idx_install_customer ON install(customer_id);
CREATE INDEX IF NOT EXISTS idx_block_rule_package ON block_rule(package_name);
CREATE INDEX IF NOT EXISTS idx_user_block_rule_customer_package ON user_block_rule(customer_id, package_name);
