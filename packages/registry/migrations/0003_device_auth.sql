ALTER TABLE cli_session ADD COLUMN user_code TEXT;
ALTER TABLE cli_session ADD COLUMN device_type TEXT DEFAULT 'email';  -- 'email' | 'device'
ALTER TABLE cli_session ADD COLUMN scope TEXT DEFAULT 'global';       -- 'local' | 'global'

ALTER TABLE customer ADD COLUMN github_id TEXT;
ALTER TABLE customer ADD COLUMN name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_github_id ON customer(github_id);
CREATE INDEX IF NOT EXISTS idx_session_user_code ON cli_session(user_code);
