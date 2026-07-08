-- Migration: merge notif_daily_checkin into notif_daily_streak
-- Date: 2026-07-08
-- The morning check-in and evening streak reminder became a single evening
-- notification. Preserve reminders for anyone who had either one enabled,
-- then drop the now-unused column.

UPDATE public.users
  SET notif_daily_streak = true
  WHERE notif_daily_checkin = true AND notif_daily_streak = false;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS notif_daily_checkin;
