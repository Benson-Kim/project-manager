CREATE TABLE IF NOT EXISTS licence (
  licence_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('trial', 'free', 'full')),
  email_hash TEXT,
  machine_hash TEXT,
  issued_at INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  expires_at INTEGER,
  updates_until INTEGER,
  redeem_code_hash TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS licence_email ON licence (email_hash);
CREATE INDEX IF NOT EXISTS licence_machine ON licence (machine_hash);
CREATE UNIQUE INDEX IF NOT EXISTS licence_identity ON licence (email_hash, machine_hash)
  WHERE email_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS tester (
  email_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_code (
  code_key TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hit (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licence_id TEXT NOT NULL REFERENCES licence (licence_id),
  app_version TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_licence ON feedback (licence_id, at);

CREATE TABLE IF NOT EXISTS consent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licence_id TEXT NOT NULL REFERENCES licence (licence_id),
  kind TEXT NOT NULL CHECK (kind IN ('testimonial', 'name')),
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  quote TEXT NOT NULL,
  display_name TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS consent_licence ON consent (licence_id, kind, id);
