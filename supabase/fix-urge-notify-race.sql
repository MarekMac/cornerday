-- ============================================================
-- CornerDay — Atomic urge notification rate-limit claim
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Replaces the read-then-write race in notify-supporter with
-- a single FOR UPDATE locked check+update. Returns true if the
-- slot was claimed (email should be sent), false if rate-limited.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_urge_notify_slot(p_link_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   text := (now() AT TIME ZONE 'UTC')::date::text;
  v_last    timestamptz;
  v_count   integer;
BEGIN
  SELECT
    last_urge_notify_at,
    CASE WHEN urge_notify_date = v_today THEN COALESCE(urge_notify_count_today, 0) ELSE 0 END
  INTO v_last, v_count
  FROM public.partner_links
  WHERE id = p_link_id
  FOR UPDATE;          -- row lock: prevents concurrent callers from both passing

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '2 hours' THEN
    RETURN false;
  END IF;

  IF v_count >= 3 THEN
    RETURN false;
  END IF;

  UPDATE public.partner_links SET
    last_urge_notify_at     = now(),
    urge_notify_date        = v_today,
    urge_notify_count_today = v_count + 1
  WHERE id = p_link_id;

  RETURN true;
END;
$$;
