-- Fix github_connections table for PostgreSQL (original migration used SQLite syntax)
-- This migration ensures the table exists with correct PostgreSQL types

-- Drop old SQLite-style table if it exists (won't work with PostgreSQL BLOB type)
DROP TABLE IF EXISTS github_repositories CASCADE;
DROP TABLE IF EXISTS github_connections CASCADE;

-- Create github_connections table with PostgreSQL types
CREATE TABLE IF NOT EXISTS github_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID,  -- NULL for workspace-level connection
    access_token TEXT NOT NULL,  -- GitHub Personal Access Token
    github_username TEXT,  -- GitHub username associated with token
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_github_connections_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create github_repositories table for linked repos
CREATE TABLE IF NOT EXISTS github_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,  -- e.g., "owner/repo"
    repo_name TEXT NOT NULL,  -- e.g., "repo"
    repo_owner TEXT NOT NULL,  -- e.g., "owner"
    repo_url TEXT NOT NULL,
    default_branch TEXT,
    is_private BOOLEAN NOT NULL DEFAULT false,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_connection_id ON github_repositories(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repositories_unique ON github_repositories(connection_id, repo_full_name);

-- Add unique constraint for workspace-level connection (only one per workspace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;

-- Comments
COMMENT ON TABLE github_connections IS 'GitHub connections for workspace or team-level integrations';
COMMENT ON COLUMN github_connections.team_id IS 'NULL for workspace-level connection';
COMMENT ON TABLE github_repositories IS 'Linked GitHub repositories for a connection';
