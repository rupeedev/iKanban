-- Create gitlab_connections table for storing GitLab PAT connections
-- Supports both workspace-level (team_id IS NULL) and team-level connections

CREATE TABLE IF NOT EXISTS gitlab_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID,  -- NULL for workspace-level connection
    access_token TEXT NOT NULL,  -- GitLab Personal Access Token
    gitlab_username TEXT,  -- GitLab username associated with token
    gitlab_url TEXT NOT NULL DEFAULT 'https://gitlab.com',  -- GitLab instance URL (for self-hosted)
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_gitlab_connections_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create gitlab_repositories table for linked repos
CREATE TABLE IF NOT EXISTS gitlab_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES gitlab_connections(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,  -- e.g., "namespace/project"
    repo_name TEXT NOT NULL,  -- e.g., "project"
    repo_namespace TEXT NOT NULL,  -- e.g., "namespace" (user or group)
    repo_url TEXT NOT NULL,
    default_branch TEXT,
    is_private BOOLEAN NOT NULL DEFAULT false,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_gitlab_connections_team_id ON gitlab_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_gitlab_repositories_connection_id ON gitlab_repositories(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_repositories_unique ON gitlab_repositories(connection_id, repo_full_name);

-- Comments
COMMENT ON TABLE gitlab_connections IS 'GitLab connections for workspace or team-level integrations';
COMMENT ON COLUMN gitlab_connections.team_id IS 'NULL for workspace-level connection';
COMMENT ON COLUMN gitlab_connections.gitlab_url IS 'GitLab instance URL, defaults to gitlab.com, can be self-hosted URL';
COMMENT ON TABLE gitlab_repositories IS 'Linked GitLab repositories for a connection';
