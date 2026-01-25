-- Create activity_logs table for tracking user actions
-- IKA-286: Admin activity tracking

CREATE TABLE IF NOT EXISTS activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    user_email      TEXT,
    action          TEXT NOT NULL,  -- create, update, delete, login, etc.
    resource_type   TEXT NOT NULL,  -- task, project, team, member, etc.
    resource_id     UUID,
    resource_name   TEXT,           -- Human-readable resource name
    workspace_id    UUID,
    team_id         UUID,
    details         JSONB,          -- Additional action details
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_id ON activity_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);

-- Compound index for common query pattern
CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_time
    ON activity_logs(workspace_id, created_at DESC);
