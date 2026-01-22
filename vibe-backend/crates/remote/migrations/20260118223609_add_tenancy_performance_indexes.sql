-- Add performance indexes for tenancy queries (TENANCY-QW-01: IKA-201)
-- These composite indexes optimize frequently-used tenant-scoped queries.
-- Using CONCURRENTLY to avoid blocking reads/writes during index creation.

-- Tasks: indexed by team + status for filtering issues by status within a team
-- (tasks.team_id -> teams.tenant_workspace_id for full tenant scoping)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_team_status
    ON tasks(team_id, status);

-- Projects: indexed by workspace for workspace-filtered project lists
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_workspace_id
    ON projects(tenant_workspace_id)
    WHERE tenant_workspace_id IS NOT NULL;

-- Team members: composite index for efficient workspace + user lookups
-- Complements existing idx_tenant_workspace_members_workspace with user-specific queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_members_workspace_user
    ON tenant_workspace_members(tenant_workspace_id, user_id);

-- Teams: indexed by workspace for listing teams within a tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_workspace_id
    ON teams(tenant_workspace_id)
    WHERE tenant_workspace_id IS NOT NULL;

-- Tasks: indexed by project for efficient task listing within projects
-- (complements existing idx_tasks_project_created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_project_status
    ON tasks(project_id, status);

-- Comments for documentation
COMMENT ON INDEX idx_tasks_team_status IS 'Optimizes filtering tasks by status within a team (10-100x speedup)';
COMMENT ON INDEX idx_projects_workspace_id IS 'Optimizes listing projects in a workspace';
COMMENT ON INDEX idx_team_members_workspace_user IS 'Optimizes user permission lookups within workspaces';
COMMENT ON INDEX idx_teams_workspace_id IS 'Optimizes listing teams within a workspace';
COMMENT ON INDEX idx_tasks_project_status IS 'Optimizes filtering tasks by status within a project';
