-- Already applied to production.
ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
UPDATE players SET is_admin = 1 WHERE id = 'tim';
