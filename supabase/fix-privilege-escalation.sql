-- ============================================================
-- CornerDay — Block privilege escalation via self-update
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Adds a BEFORE UPDATE trigger that prevents authenticated users
-- from modifying their own is_premium / is_admin / ban columns.
-- Service role (RevenueCat webhook, edge functions) and admins
-- are exempt and can update any column.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_privilege_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role key: jwt role claim is 'service_role' — allow everything
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- App admins (is_admin = true in users table) — allow everything
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  -- Regular authenticated users: silently restore privilege columns
  NEW.is_premium       := OLD.is_premium;
  NEW.is_admin         := OLD.is_admin;
  NEW.is_banned        := OLD.is_banned;
  NEW.ban_reason       := OLD.ban_reason;
  NEW.ban_expires_at   := OLD.ban_expires_at;
  NEW.ban_appeal_note  := OLD.ban_appeal_note;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_privilege_immutability ON public.users;
CREATE TRIGGER trg_privilege_immutability
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_privilege_immutability();
