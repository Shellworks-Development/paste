-- self-service API key issuance ---------------------------------------------

ALTER TABLE tokens ADD COLUMN issued_ip TEXT;

CREATE TABLE IF NOT EXISTS token_issuance (
  ip             TEXT PRIMARY KEY,
  last_issued_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_issuance_at ON token_issuance (last_issued_at);
