-- notify-supporter only rate-limited the 'urge' notification type (via
-- claim_urge_notify_slot). 'relapse' and 'milestone' had no cap at all, so a
-- buggy retry loop or a malicious authenticated caller could spam a
-- supporter's inbox on repeat calls. Add the same claim-a-slot pattern for
-- both, with a lighter cooldown since these events are naturally rarer than
-- urges.

ALTER TABLE partner_links
  ADD COLUMN IF NOT EXISTS last_relapse_notify_at timestamptz,
  ADD COLUMN IF NOT EXISTS relapse_notify_count_today integer,
  ADD COLUMN IF NOT EXISTS relapse_notify_date date,
  ADD COLUMN IF NOT EXISTS last_milestone_notify_at timestamptz,
  ADD COLUMN IF NOT EXISTS milestone_notify_count_today integer,
  ADD COLUMN IF NOT EXISTS milestone_notify_date date;

CREATE OR REPLACE FUNCTION public.claim_relapse_notify_slot(p_link_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today   text := (now() AT TIME ZONE 'UTC')::date::text;
  v_last    timestamptz;
  v_count   integer;
BEGIN
  SELECT
    last_relapse_notify_at,
    CASE WHEN relapse_notify_date = v_today THEN COALESCE(relapse_notify_count_today, 0) ELSE 0 END
  INTO v_last, v_count
  FROM public.partner_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '1 hour' THEN
    RETURN false;
  END IF;

  IF v_count >= 5 THEN
    RETURN false;
  END IF;

  UPDATE public.partner_links SET
    last_relapse_notify_at     = now(),
    relapse_notify_date        = v_today,
    relapse_notify_count_today = v_count + 1
  WHERE id = p_link_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_milestone_notify_slot(p_link_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today   text := (now() AT TIME ZONE 'UTC')::date::text;
  v_last    timestamptz;
  v_count   integer;
BEGIN
  SELECT
    last_milestone_notify_at,
    CASE WHEN milestone_notify_date = v_today THEN COALESCE(milestone_notify_count_today, 0) ELSE 0 END
  INTO v_last, v_count
  FROM public.partner_links
  WHERE id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '1 hour' THEN
    RETURN false;
  END IF;

  IF v_count >= 5 THEN
    RETURN false;
  END IF;

  UPDATE public.partner_links SET
    last_milestone_notify_at     = now(),
    milestone_notify_date        = v_today,
    milestone_notify_count_today = v_count + 1
  WHERE id = p_link_id;

  RETURN true;
END;
$function$;
