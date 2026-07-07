-- Migration: drop unused users.debt_target_date column
-- Date: 2026-07-07
-- Debts can each have their own payoff target date (debts.target_date), so a
-- single global date on users was misleading once a user has multiple debts.
-- The Log Debt picker was also silently overwriting this column as a side
-- effect. It has no remaining readers/writers in the app.

ALTER TABLE users
  DROP COLUMN IF EXISTS debt_target_date;
