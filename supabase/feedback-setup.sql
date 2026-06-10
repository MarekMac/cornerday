-- ============================================================
-- CornerDay — Feedback Table
-- Run once in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  type        text        NOT NULL CHECK (type IN ('bug', 'feature', 'general')),
  message     text        NOT NULL,
  app_version text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback
DROP POLICY IF EXISTS users_insert_feedback ON feedback;
CREATE POLICY users_insert_feedback ON feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin can read all feedback
DROP POLICY IF EXISTS admin_select_feedback ON feedback;
CREATE POLICY admin_select_feedback ON feedback
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
