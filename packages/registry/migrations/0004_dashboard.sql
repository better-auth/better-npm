-- Per-customer package / version blocks (version = '*' means entire package)
CREATE TABLE IF NOT EXISTS customer_block (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(customer_id, package_name, version)
);

CREATE INDEX IF NOT EXISTS idx_customer_block_customer ON customer_block(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_block_lookup ON customer_block(customer_id, package_name);

-- Usage: metadata fetches and tarball downloads per customer
CREATE TABLE IF NOT EXISTS customer_usage (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  package_name TEXT NOT NULL,
  version TEXT,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_usage_customer_time ON customer_usage(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_usage_customer_pkg ON customer_usage(customer_id, package_name);
