-- IKA-319: Fix member_project_access table for PostgreSQL
-- The original migration used SQLite syntax; this creates the proper PostgreSQL version

-- Drop the SQLite-style table if it exists (safe to run)
DROP TABLE IF EXISTS member_project_access;

-- Create proper PostgreSQL table with UUID types
CREATE TABLE IF NOT EXISTS member_project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(member_id, project_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_member_project_access_member ON member_project_access(member_id);
CREATE INDEX IF NOT EXISTS idx_member_project_access_project ON member_project_access(project_id);

COMMENT ON TABLE member_project_access IS 'Controls which projects each team member can access';
