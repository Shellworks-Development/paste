-- opt-in unsafe mode: allow scoped, sanitized custom CSS ---------------------

ALTER TABLE pastes ADD COLUMN unsafe INTEGER NOT NULL DEFAULT 0;
