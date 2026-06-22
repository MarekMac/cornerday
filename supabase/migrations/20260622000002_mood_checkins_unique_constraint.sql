-- Migration: add unique constraint on mood_checkins to prevent duplicate daily entries
-- Date: 2026-06-22
-- Fixes: DI-05 (duplicate mood check-ins)

-- First clean up any existing duplicates, keeping the most recent
DELETE FROM mood_checkins a
USING mood_checkins b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND date_trunc('day', a.created_at) = date_trunc('day', b.created_at);

-- Then add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS mood_checkins_user_day_unique
ON mood_checkins (user_id, date_trunc('day', created_at AT TIME ZONE 'UTC'));
