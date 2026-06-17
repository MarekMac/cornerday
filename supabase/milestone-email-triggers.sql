-- Trigger milestone-email immediately when a user's streak reaches a milestone day
-- NOTE: WEBHOOK_SECRET is stored only in Supabase Edge Function secrets (never committed).
--       To apply these triggers, run this SQL via the Supabase SQL Editor after replacing
--       WEBHOOK_SECRET_PLACEHOLDER with the actual secret from the Edge Function settings.
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
WHEN (NEW.current_streak > OLD.current_streak AND NEW.current_streak IN (7,30,60,90,182,365,730,1095))
EXECUTE FUNCTION public.trigger_milestone_email();


-- Trigger recovery-milestone-email immediately when a debt payment is logged
CREATE OR REPLACE FUNCTION public.trigger_recovery_milestone_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://cdgsiotlocurwnqxebrh.supabase.co/functions/v1/recovery-milestone-email',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer WEBHOOK_SECRET_PLACEHOLDER"}'::jsonb,
    body    := jsonb_build_object('user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_recovery_milestone_email ON public.debt_payments;
CREATE TRIGGER on_payment_recovery_milestone_email
AFTER INSERT ON public.debt_payments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recovery_milestone_email();
