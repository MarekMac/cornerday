-- Migration: add custom milestone and streak-shield undo columns
-- Date: 2026-06-24
-- Fixes: custom milestone and shield undo survive app reinstalls / AsyncStorage wipes

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_milestone_type    TEXT,
  ADD COLUMN IF NOT EXISTS custom_milestone_target  NUMERIC,
  ADD COLUMN IF NOT EXISTS custom_milestone_icon    TEXT,
  ADD COLUMN IF NOT EXISTS shield_undo_prev_quit        TEXT,
  ADD COLUMN IF NOT EXISTS shield_undo_prev_streak_days INTEGER,
  ADD COLUMN IF NOT EXISTS shield_undo_expires_at       BIGINT,
  ADD COLUMN IF NOT EXISTS shield_undo_relapse_row_id   UUID;
