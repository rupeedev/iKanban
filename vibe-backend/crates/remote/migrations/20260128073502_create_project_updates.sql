-- Create project_updates table for Pulse feature
-- IKA-338: Pulse - project status updates feed

-- Health status enum for project updates
DO $$
BEGIN
    CREATE TYPE project_health_status AS ENUM (
        'on_track',
        'at_risk',
        'off_track',
        'completed',
        'paused'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Main project updates table
CREATE TABLE IF NOT EXISTS project_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    health_status   project_health_status,
    progress_data   JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: Get updates for a project, newest first
CREATE INDEX idx_project_updates_project_created
    ON project_updates(project_id, created_at DESC);

-- For "Recent" tab: All updates sorted by time
CREATE INDEX idx_project_updates_created
    ON project_updates(created_at DESC);

-- For "For me" tab: Updates by author
CREATE INDEX idx_project_updates_author_created
    ON project_updates(author_id, created_at DESC);

-- Partial index for health status filtering
CREATE INDEX idx_project_updates_health
    ON project_updates(health_status)
    WHERE health_status IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_project_updates_updated_at ON project_updates;
CREATE TRIGGER trg_project_updates_updated_at
    BEFORE UPDATE ON project_updates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE project_updates IS 'Project status updates for Pulse feed';
COMMENT ON COLUMN project_updates.progress_data IS 'JSON: {"milestones": [{"name": "...", "progress": 50}]}';
