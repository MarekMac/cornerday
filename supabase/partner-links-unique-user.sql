-- Ensure each user can only have one partner link at a time.
-- Prevents maybeSingle() from returning null when duplicate rows exist
-- (e.g. from a double-tap race condition on "Generate link").
ALTER TABLE partner_links DROP CONSTRAINT IF EXISTS partner_links_user_id_key;
ALTER TABLE partner_links ADD CONSTRAINT partner_links_user_id_key UNIQUE (user_id);
