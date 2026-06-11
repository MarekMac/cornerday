-- ============================================================
-- CornerDay — User Moderation
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add is_banned flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- STEP 2: Admin can read all users (others can only read their own row)
DROP POLICY IF EXISTS admin_select_users ON users;
CREATE POLICY admin_select_users ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- STEP 3: Admin can update any user (e.g. toggle is_banned)
DROP POLICY IF EXISTS admin_update_users ON users;
CREATE POLICY admin_update_users ON users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- STEP 4: Admin can delete any user row
DROP POLICY IF EXISTS admin_delete_users ON users;
CREATE POLICY admin_delete_users ON users
  FOR DELETE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- STEP 5: Banned users cannot create community posts or comments
-- Update INSERT policies to reject banned users
DROP POLICY IF EXISTS insert_community_posts ON community_posts;
CREATE POLICY insert_community_posts ON community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_banned = true)
  );

DROP POLICY IF EXISTS insert_community_comments ON community_comments;
CREATE POLICY insert_community_comments ON community_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_banned = true)
  );
