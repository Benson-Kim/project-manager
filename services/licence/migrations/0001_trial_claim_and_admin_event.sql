CREATE TABLE IF NOT EXISTS trial_claim (
  email_hash TEXT PRIMARY KEY,
  machine_hash TEXT NOT NULL UNIQUE,
  licence_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO trial_claim (email_hash, machine_hash, licence_id, claimed_at)
  SELECT email_hash, machine_hash, licence_id, issued_at FROM licence
  WHERE email_hash IS NOT NULL AND machine_hash IS NOT NULL
  ORDER BY issued_at;

CREATE TABLE IF NOT EXISTS admin_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  client TEXT NOT NULL,
  detail TEXT
);

CREATE TRIGGER IF NOT EXISTS admin_event_no_update BEFORE UPDATE ON admin_event
BEGIN
  SELECT RAISE(ABORT, 'admin_event is append only');
END;

CREATE TRIGGER IF NOT EXISTS admin_event_no_delete BEFORE DELETE ON admin_event
BEGIN
  SELECT RAISE(ABORT, 'admin_event is append only');
END;
