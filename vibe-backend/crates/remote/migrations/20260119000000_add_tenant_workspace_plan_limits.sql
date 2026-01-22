-- IKA-176: Add plan and limits columns to tenant_workspaces
-- Adds subscription plan tracking and resource limits for multi-tenancy

-- Add plan column (subscription tier: free, pro, enterprise)
ALTER TABLE tenant_workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';

-- Add resource limit columns with sensible free-tier defaults
ALTER TABLE tenant_workspaces ADD COLUMN max_teams BIGINT NOT NULL DEFAULT 2;
ALTER TABLE tenant_workspaces ADD COLUMN max_projects BIGINT NOT NULL DEFAULT 5;
ALTER TABLE tenant_workspaces ADD COLUMN max_members BIGINT NOT NULL DEFAULT 3;
ALTER TABLE tenant_workspaces ADD COLUMN max_storage_gb BIGINT NOT NULL DEFAULT 1;

-- Add index for plan column (useful for filtering by subscription tier)
CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_plan ON tenant_workspaces(plan);
