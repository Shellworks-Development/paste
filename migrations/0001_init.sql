-- paste: initial schema ------------------------------------------------------

CREATE TABLE IF NOT EXISTS pastes (
  id              TEXT PRIMARY KEY,
  title           TEXT,
  language        TEXT NOT NULL DEFAULT 'markdown',
  size            INTEGER NOT NULL,
  r2_key          TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'unlisted',
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  views           INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  owner_id        TEXT REFERENCES tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pastes_created_at  ON pastes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pastes_expires_at  ON pastes (expires_at);
CREATE INDEX IF NOT EXISTS idx_pastes_owner       ON pastes (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pastes_public      ON pastes (visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS tokens (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
