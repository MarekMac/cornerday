-- ============================================================
-- CornerDay — User Moderation
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add is_banned flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

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
  SELECT COALESCE((SELECT is_banned FROM public.users WHERE id = auth.uid()), false);
$$;

-- STEP 3: Admin can read all users (others can only read their own row)
DROP POLICY IF EXISTS admin_select_users ON users;
CREATE POLICY admin_select_users ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_user());

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
