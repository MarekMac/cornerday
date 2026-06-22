-- Migration: add savings goal columns to users table
-- Date: 2026-06-22
-- Fixes: B-02 (savings goal persistence across reinstalls)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS savings_goal_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS savings_goal_label TEXT,
  ADD COLUMN IF NOT EXISTS savings_goal_icon TEXT,
  ADD COLUMN IF NOT EXISTS savings_goal_target_date DATE;
