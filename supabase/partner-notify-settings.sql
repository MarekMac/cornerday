-- Supporter notification settings
-- Run in Supabase SQL editor

-- Email address for the user's trusted contact (separate from supporter_email which the supporter provides)
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_contact_email text;

-- Columns on partner_links:
--   supporter_email  — email the supporter provides on the partner web page
--   notify_urge      — user opts in to send supporter an email when urge hits
--   notify_relapse   — user opts in to send supporter an email on streak reset
--   notify_milestone — user opts in to send supporter an email on milestone earned
ALTER TABLE partner_links
  ADD COLUMN IF NOT EXISTS supporter_email   text,
  ADD COLUMN IF NOT EXISTS notify_urge       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_relapse    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_milestone  boolean NOT NULL DEFAULT false;
