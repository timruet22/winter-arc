-- Already applied to the production database; kept for local development.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT,          -- SHA-256 of the access token, never the token itself
  claimed_at TEXT,
  public_json TEXT,         -- what friends may see
  public_updated INTEGER,
  state_enc TEXT,           -- private state, AES-GCM encrypted in the browser
  state_updated INTEGER,
  seed_json TEXT            -- one-time import of data from the old app
);
INSERT OR IGNORE INTO players (id, name) VALUES ('tim', 'Tim'), ('freund', 'Freund');
