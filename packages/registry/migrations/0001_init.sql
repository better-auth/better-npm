-- Tracked packages (ones we monitor for new versions)
CREATE TABLE IF NOT EXISTS package (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  dist_tags TEXT,        -- JSON: { latest: "1.0.0" }
  latest_known TEXT,     -- last version we've seen from upstream
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
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | under_review
  created_at INTEGER NOT NULL,
  UNIQUE(package_id, version)
);

-- Review results (AI and human)
CREATE TABLE IF NOT EXISTS review (
  id TEXT PRIMARY KEY,
  package_version_id TEXT NOT NULL REFERENCES package_version(id),
  reviewer_type TEXT NOT NULL,  -- ai | human
  status TEXT NOT NULL,         -- approved | rejected | needs_human_review | in_progress
  risk_score REAL,
  findings TEXT,                -- JSON
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

CREATE INDEX IF NOT EXISTS idx_package_name ON package(name);
CREATE INDEX IF NOT EXISTS idx_version_package ON package_version(package_id);
CREATE INDEX IF NOT EXISTS idx_version_status ON package_version(status);
CREATE INDEX IF NOT EXISTS idx_review_status ON review(status);
