-- Add tenant_workspace_id to projects table for workspace scoping (idempotent)
-- This allows filtering projects by workspace

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tenant_workspace_id') THEN
        ALTER TABLE projects ADD COLUMN tenant_workspace_id UUID REFERENCES tenant_workspaces(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Index for efficient workspace filtering
CREATE INDEX IF NOT EXISTS idx_projects_tenant_workspace ON projects(tenant_workspace_id);

-- Comment for documentation
COMMENT ON COLUMN projects.tenant_workspace_id IS 'The tenant workspace this project belongs to. NULL means legacy project without workspace.';
