-- The 'email_2_weeks' (day 14) milestone defined in milestone-email/index.ts
-- was never reachable: the trigger's WHEN clause omitted 14 from its list,
-- and the daily-cron safety net that used to catch missed milestones was
-- removed in 20260702000003. Add 14 back to the trigger condition.
-- NOTE: WEBHOOK_SECRET_PLACEHOLDER must be replaced with the real secret when
-- applying — never commit the real value (see supabase/milestone-email-triggers.sql).
CREATE OR REPLACE FUNCTION public.trigger_milestone_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://cdgsiotlocurwnqxebrh.supabase.co/functions/v1/milestone-email',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer WEBHOOK_SECRET_PLACEHOLDER"}'::jsonb,
    body    := jsonb_build_object('user_id', NEW.user_id, 'streak', NEW.current_streak)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_streak_milestone_email ON public.streaks;
CREATE TRIGGER on_streak_milestone_email
AFTER UPDATE OF current_streak ON public.streaks
FOR EACH ROW
WHEN (NEW.current_streak > OLD.current_streak AND NEW.current_streak IN (7,14,30,60,90,182,365,730,1095))
EXECUTE FUNCTION public.trigger_milestone_email();
