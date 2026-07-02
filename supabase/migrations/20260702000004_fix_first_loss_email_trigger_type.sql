-- trigger_loss_emails() fired first-loss-email on losses.type = 'loss', but
-- the app has written type = 'session' for a logged gambling loss since the
-- debt-tracker rewrite ('loss' is a pre-rewrite value with zero live rows
-- and no current insert path). This email could never actually fire.
--
-- NOTE: SERVICE_ROLE_JWT_PLACEHOLDER must be replaced with the project's
-- actual service-role JWT before running this in the SQL Editor — never
-- commit the real value (see the same convention in
-- supabase/milestone-email-triggers.sql).
CREATE OR REPLACE FUNCTION public.trigger_loss_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.type = 'journey_started' THEN
    PERFORM net.http_post(
      url := 'https://cdgsiotlocurwnqxebrh.supabase.co/functions/v1/welcome-email',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_JWT_PLACEHOLDER'),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_milliseconds := 5000
    );
  ELSIF NEW.type = 'session' THEN
    PERFORM net.http_post(
      url := 'https://cdgsiotlocurwnqxebrh.supabase.co/functions/v1/first-loss-email',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer SERVICE_ROLE_JWT_PLACEHOLDER'),
      body := jsonb_build_object('record', row_to_json(NEW)),
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
END;
$$;
