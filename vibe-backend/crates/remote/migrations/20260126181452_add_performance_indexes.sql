-- Add performance indexes for dashboard queries
-- Reference: docs-ikanban/architecture/PERFORMANCE-OPTIMIZATION.md (IKA-301)
--
-- NOTE (2026-01-26): These indexes are on shared_tasks, but dashboard queries
-- actually use the separate "tasks" table which ALREADY HAS these indexes:
--   - idx_tasks_team_status, idx_tasks_assignee_id, idx_tasks_team_id, etc.
-- These indexes are harmless but unused. Left in place to avoid migration conflicts.
--
-- The "tasks" table has: team_id, assignee_id, issue_number, due_date
-- The "shared_tasks" table has: organization_id, assignee_user_id (different columns)

-- Index for faster assignee lookups on shared_tasks table
CREATE INDEX IF NOT EXISTS idx_shared_tasks_assignee_user_id ON shared_tasks(assignee_user_id);

-- Index for faster organization_id lookups on shared_tasks table (team filtering)
CREATE INDEX IF NOT EXISTS idx_shared_tasks_organization_id ON shared_tasks(organization_id);

-- Composite index for dashboard queries filtering by organization, status, and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_status_created ON shared_tasks(organization_id, status, created_at DESC);
