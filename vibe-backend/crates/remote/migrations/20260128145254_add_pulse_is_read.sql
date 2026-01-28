-- Add is_read column to project_updates for tracking read status
-- IKA-343: Add red dot notification badges to Activity and Triage sidebar items

ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient summary queries (user_id comes from author_id for now)
CREATE INDEX IF NOT EXISTS idx_project_updates_author_read
ON project_updates(author_id, is_read, created_at DESC);
