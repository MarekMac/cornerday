-- Fix: community_posts/community_comments have "using (true)" SELECT policies,
-- so any authenticated user can bypass the masked community_posts_public /
-- community_comments_public views entirely by querying the base tables
-- directly via REST, exposing the real user_id behind every "anonymous"
-- post/comment. The views only mask user_id for reads that go through them —
-- they never restricted access to the underlying tables themselves.
--
-- Fix: restrict base-table SELECT to the caller's own rows (or admins, who
-- need to read any post/comment content to review reports in moderation.tsx),
-- and make the public views bypass RLS (drop security_invoker) so they can
-- still read every row and apply the existing masking logic — the views
-- become the only way for a regular user to read other users' posts/comments.

DROP POLICY IF EXISTS "read posts" ON community_posts;
CREATE POLICY "read own or admin posts" ON community_posts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "read comments" ON community_comments;
CREATE POLICY "read own or admin comments" ON community_comments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_user());

CREATE OR REPLACE VIEW community_posts_public
AS
SELECT
  cp.id,
  CASE
    WHEN cp.is_anonymous AND cp.user_id IS DISTINCT FROM auth.uid()
    THEN NULL::uuid
    ELSE cp.user_id
  END AS user_id,
  cp.content,
  cp.tag,
  cp.reactions_count,
  cp.comments_count,
  cp.reports_count,
  cp.created_at,
  cp.is_anonymous,
  CASE
    WHEN cp.is_anonymous AND cp.user_id IS DISTINCT FROM auth.uid()
    THEN NULL::text
    ELSE u.display_name
  END AS author_name,
  CASE
    WHEN cp.is_anonymous AND cp.user_id IS DISTINCT FROM auth.uid()
    THEN NULL::integer
    ELSE s.current_streak
  END AS author_streak
FROM community_posts cp
LEFT JOIN users u ON u.id = cp.user_id
LEFT JOIN streaks s ON s.user_id = cp.user_id;

GRANT SELECT ON community_posts_public TO authenticated;

CREATE OR REPLACE VIEW community_comments_public
AS
  SELECT
    c.id,
    c.post_id,
    CASE
      WHEN c.is_anonymous AND c.user_id IS DISTINCT FROM auth.uid() THEN NULL::uuid
      ELSE c.user_id
    END AS user_id,
    c.content,
    c.created_at,
    c.helpful_count,
    c.is_anonymous,
    CASE
      WHEN c.is_anonymous AND c.user_id IS DISTINCT FROM auth.uid() THEN NULL
      ELSE u.display_name
    END AS author_name
  FROM community_comments c
  LEFT JOIN users u ON u.id = c.user_id;

GRANT SELECT ON community_comments_public TO authenticated;

-- Fix: 20260624000004_users_rls_hardening.sql tightened the users SELECT
-- policy to own-row-only but never added an admin bypass, silently breaking
-- moderation.tsx's loadUsers() (lists all users for the admin panel) — it now
-- only returns the admin's own row. Add an additive admin bypass alongside
-- the existing own-row policies, reusing the same is_admin_user() helper
-- already used elsewhere for community moderation.
CREATE POLICY admin_select_users ON users
  FOR SELECT TO authenticated
  USING (is_admin_user());
