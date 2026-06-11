-- ============================================================
-- CornerDay — User Moderation
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add moderation columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_appeal_note text;

-- STEP 2: Helper functions (SECURITY DEFINER bypasses RLS — prevents infinite
-- recursion when policies on `users` reference the same table).
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_banned_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_banned AND (ban_expires_at IS NULL OR ban_expires_at > now())
     FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

-- STEP 3: All authenticated users can read any user row (display names are public
-- social data — required for PostgREST joins in community feed)
DROP POLICY IF EXISTS admin_select_users ON users;
CREATE POLICY admin_select_users ON users
  FOR SELECT TO authenticated
  USING (true);

-- STEP 4: Admin can update any user (e.g. toggle is_banned)
DROP POLICY IF EXISTS admin_update_users ON users;
CREATE POLICY admin_update_users ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin_user());

-- STEP 5: Admin can delete any user row
DROP POLICY IF EXISTS admin_delete_users ON users;
CREATE POLICY admin_delete_users ON users
  FOR DELETE TO authenticated
  USING (id = auth.uid() OR public.is_admin_user());

-- STEP 6: Banned users cannot create community posts or comments
DROP POLICY IF EXISTS insert_community_posts ON community_posts;
CREATE POLICY insert_community_posts ON community_posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT public.is_banned_user());

DROP POLICY IF EXISTS insert_community_comments ON community_comments;
CREATE POLICY insert_community_comments ON community_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT public.is_banned_user());
