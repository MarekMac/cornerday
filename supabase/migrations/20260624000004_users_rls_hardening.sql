-- Replace the broad "all authenticated users can read all user rows" SELECT policy
-- with own-row-only access. Display names needed in community feeds are exposed
-- through a security_invoker view instead of direct table access.

-- Step 1: Tighten users table SELECT policy
DROP POLICY IF EXISTS admin_select_users ON users;
CREATE POLICY users_own_row ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Step 2: Public view exposing only the columns that community features need
CREATE OR REPLACE VIEW users_public
WITH (security_invoker = on)
AS
  SELECT id, display_name
  FROM users;

GRANT SELECT ON users_public TO authenticated;

-- Step 3: Community comments view with embedded author metadata.
-- Anonymous posts by OTHER users get a null author_name (own anon posts visible to self).
-- Mirrors the same pattern as community_posts_public.
CREATE OR REPLACE VIEW community_comments_public
WITH (security_invoker = on)
AS
  SELECT
    c.id,
    c.post_id,
    c.user_id,
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
