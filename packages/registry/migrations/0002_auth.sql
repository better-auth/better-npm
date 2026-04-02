-- Customers (who paid)
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | past_due
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
  code TEXT,                -- 6-digit magic code for returning users
  token TEXT,               -- generated token (set after payment/verify)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | expired
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_email ON customer(email);
CREATE INDEX IF NOT EXISTS idx_token_hash ON token(token_hash);
CREATE INDEX IF NOT EXISTS idx_session_id ON cli_session(id);
