-- Add performance indexes for dashboard queries
-- Reference: docs-ikanban/architecture/PERFORMANCE-OPTIMIZATION.md (IKA-301)

-- Index for faster assignee lookups on tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);

-- Index for faster team_id lookups on shared_tasks table
CREATE INDEX IF NOT EXISTS idx_shared_tasks_team_id ON shared_tasks(team_id);

-- Composite index for dashboard queries filtering by team, status, and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_tasks_team_status_created ON tasks(team_id, status, created_at DESC);
