-- IKA-176: Add plan and limits columns to tenant_workspaces (idempotent)
-- Adds subscription plan tracking and resource limits for multi-tenancy

-- Add plan column (subscription tier: free, pro, enterprise)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'plan') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_teams') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_teams BIGINT NOT NULL DEFAULT 2;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_projects') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_projects BIGINT NOT NULL DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_members') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_members BIGINT NOT NULL DEFAULT 3;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_storage_gb') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_storage_gb BIGINT NOT NULL DEFAULT 1;
    END IF;
END
$$;

-- Add index for plan column (useful for filtering by subscription tier)
CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_plan ON tenant_workspaces(plan);
