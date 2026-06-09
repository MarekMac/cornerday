-- ============================================================
-- CornerDay — Community v2 schema additions
-- Run this in the Supabase SQL editor after supabase-community.sql
-- ============================================================

-- ─── 1. Streak badge: nothing to add to DB (current_streak already exists
--        in streaks table from core schema). The join is done in the app
--        query. ────────────────────────────────────────────────────────────

-- ─── 2. Anonymous posting ────────────────────────────────────────────────

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

-- ─── 3. Comment helpful reactions ────────────────────────────────────────

ALTER TABLE community_comments
  ADD COLUMN IF NOT EXISTS helpful_count int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_comment_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

-- Trigger: keep helpful_count in sync
CREATE OR REPLACE FUNCTION fn_update_helpful_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_comments SET helpful_count = helpful_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_comments SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_helpful_count ON community_comment_reactions;
CREATE TRIGGER trg_helpful_count
  AFTER INSERT OR DELETE ON community_comment_reactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_helpful_count();

-- RLS for community_comment_reactions
ALTER TABLE community_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_reactions_read_all"   ON community_comment_reactions;
DROP POLICY IF EXISTS "comment_reactions_insert_own" ON community_comment_reactions;
DROP POLICY IF EXISTS "comment_reactions_delete_own" ON community_comment_reactions;

CREATE POLICY "comment_reactions_read_all"
  ON community_comment_reactions FOR SELECT
  USING (true);

CREATE POLICY "comment_reactions_insert_own"
  ON community_comment_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_reactions_delete_own"
  ON community_comment_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 4. Bookmarks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_bookmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE community_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmarks_read_own"   ON community_bookmarks;
DROP POLICY IF EXISTS "bookmarks_insert_own" ON community_bookmarks;
DROP POLICY IF EXISTS "bookmarks_delete_own" ON community_bookmarks;

CREATE POLICY "bookmarks_read_own"
  ON community_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert_own"
  ON community_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete_own"
  ON community_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 5. Grant realtime access to new tables ──────────────────────────────

-- (Optional) enable realtime for comment reactions if you want live counts
-- ALTER PUBLICATION supabase_realtime ADD TABLE community_comment_reactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE community_bookmarks;
