-- Better Auth device-authorization plugin (SQLite, camelCase columns per Kysely adapter).
-- Apply when upgrading: sqlite3 better-npm.db < scripts/sql/device-code-table.sql
CREATE TABLE IF NOT EXISTS "deviceCode" (
  "id" text NOT NULL PRIMARY KEY,
  "deviceCode" text NOT NULL,
  "userCode" text NOT NULL,
  "userId" text,
  "expiresAt" date NOT NULL,
  "status" text NOT NULL,
  "lastPolledAt" date,
  "pollingInterval" integer,
  "clientId" text,
  "scope" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "deviceCode_deviceCode_unique" ON "deviceCode" ("deviceCode");
CREATE UNIQUE INDEX IF NOT EXISTS "deviceCode_userCode_unique" ON "deviceCode" ("userCode");
