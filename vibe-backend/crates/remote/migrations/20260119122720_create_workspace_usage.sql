-- Create workspace_usage table for tracking resource consumption per workspace (IKA-179)
-- Tracks teams, projects, members, tasks, AI requests, and storage usage per billing period

CREATE TABLE IF NOT EXISTS workspace_usage (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Key to tenant workspace
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,

    -- Billing Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Usage Counters
    teams_count INTEGER NOT NULL DEFAULT 0,
    projects_count INTEGER NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,
    tasks_count INTEGER NOT NULL DEFAULT 0,
    ai_requests_count INTEGER NOT NULL DEFAULT 0,
    storage_bytes BIGINT NOT NULL DEFAULT 0,

    -- Audit Trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints: One record per workspace per billing period
    CONSTRAINT unique_workspace_period UNIQUE(tenant_workspace_id, period_start)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_usage_workspace
    ON workspace_usage(tenant_workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_period
    ON workspace_usage(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_workspace_period
    ON workspace_usage(tenant_workspace_id, period_start DESC);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_workspace_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_usage_updated_at
    BEFORE UPDATE ON workspace_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_usage_updated_at();

-- Comment on table
COMMENT ON TABLE workspace_usage IS 'Tracks resource usage per workspace per billing period for limit enforcement';
COMMENT ON COLUMN workspace_usage.teams_count IS 'Current number of teams in the workspace';
COMMENT ON COLUMN workspace_usage.projects_count IS 'Current number of projects in the workspace';
COMMENT ON COLUMN workspace_usage.members_count IS 'Current number of members in the workspace';
COMMENT ON COLUMN workspace_usage.tasks_count IS 'Current number of tasks in the workspace';
COMMENT ON COLUMN workspace_usage.ai_requests_count IS 'AI requests made during this billing period';
COMMENT ON COLUMN workspace_usage.storage_bytes IS 'Total storage used in bytes';
