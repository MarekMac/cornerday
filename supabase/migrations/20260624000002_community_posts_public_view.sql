-- Mask user_id + author info server-side for anonymous posts by other users.
-- The base community_posts table still exposes real user_id to anyone with the
-- anon key. This view enforces column-level masking at the DB layer.
CREATE OR REPLACE VIEW community_posts_public
WITH (security_invoker = on)
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
