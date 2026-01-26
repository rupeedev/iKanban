-- Add performance indexes for dashboard queries
-- Reference: docs-ikanban/architecture/PERFORMANCE-OPTIMIZATION.md (IKA-301)
--
-- Note: The main tasks table is "shared_tasks" (not "tasks")
-- Column mapping:
--   - assignee is "assignee_user_id" (not "assignee_id")
--   - team reference is via "organization_id" (not "team_id")

-- Index for faster assignee lookups on shared_tasks table
CREATE INDEX IF NOT EXISTS idx_shared_tasks_assignee_user_id ON shared_tasks(assignee_user_id);

-- Index for faster organization_id lookups on shared_tasks table (team filtering)
CREATE INDEX IF NOT EXISTS idx_shared_tasks_organization_id ON shared_tasks(organization_id);

-- Composite index for dashboard queries filtering by organization, status, and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_status_created ON shared_tasks(organization_id, status, created_at DESC);
