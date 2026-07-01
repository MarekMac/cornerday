-- Fix: community_comments_public masked author_name for anonymous comments but
-- left user_id unmasked, leaking the real author's identity to every client
-- (unlike community_posts_public, which correctly nulls user_id too). Anyone
-- could correlate that id against the same user's non-anonymous activity to
-- deanonymize them. Recreate the view with the same masking pattern used for
-- posts.
CREATE OR REPLACE VIEW community_comments_public
WITH (security_invoker = on)
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
