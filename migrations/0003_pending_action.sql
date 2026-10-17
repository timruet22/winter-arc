-- Already applied to production. One-time actions the player's app runs on next load.
ALTER TABLE players ADD COLUMN pending_action TEXT;
