-- Add rolling summary column for AI Corner cross-session context.
-- Raw messages stay on-device; only the AI-generated summary is stored here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_context text;
