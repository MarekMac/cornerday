-- Add share settings columns to partner_links
-- Run this in the Supabase SQL editor

ALTER TABLE partner_links
  ADD COLUMN IF NOT EXISTS expires_at       timestamptz,
  ADD COLUMN IF NOT EXISTS share_mood       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_milestones boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_recovery   boolean NOT NULL DEFAULT false;
