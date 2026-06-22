-- Migration: add user profile columns for recovery plan and trusted contact
-- Date: 2026-06-22
-- Fixes: U-06 (recovery plan persistence), U-07 (trusted contact survives reinstall)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_mantra TEXT,
  ADD COLUMN IF NOT EXISTS distraction_choices TEXT[],
  ADD COLUMN IF NOT EXISTS trusted_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS trusted_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS trusted_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS trusted_contact_email TEXT;
