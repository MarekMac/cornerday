-- ============================================================
-- CornerDay — Admin & Moderation Setup
-- Run once in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add is_admin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- STEP 2: Add status tracking to community_reports
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS status       text        DEFAULT 'pending';
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS reviewer_id  uuid        REFERENCES users(id);
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

-- STEP 3: Grant admin to your account
UPDATE users SET is_admin = true WHERE email = 'marekmac.ski@gmail.com';

-- STEP 4: RLS policies so the admin can moderate from the app
--         (uses auth.uid() to verify the caller is an admin)

-- Reports: admin can read all pending reports
DROP POLICY IF EXISTS admin_select_reports ON community_reports;
CREATE POLICY admin_select_reports ON community_reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Reports: admin can update status (dismiss / actioned)
DROP POLICY IF EXISTS admin_update_reports ON community_reports;
CREATE POLICY admin_update_reports ON community_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Posts: admin can delete any post
DROP POLICY IF EXISTS admin_delete_posts ON community_posts;
CREATE POLICY admin_delete_posts ON community_posts
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Comments: admin can delete any comment
DROP POLICY IF EXISTS admin_delete_comments ON community_comments;
CREATE POLICY admin_delete_comments ON community_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );
