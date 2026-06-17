-- Prevent duplicate badges per user, which also acts as the idempotency guard
-- for the recovery-milestone-email edge function (insert conflict = skip email).
ALTER TABLE badges
  ADD CONSTRAINT badges_user_badge_unique UNIQUE (user_id, badge_type);
