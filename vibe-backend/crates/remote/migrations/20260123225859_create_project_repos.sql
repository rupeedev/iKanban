-- Create repos table for storing repository metadata in remote
-- This stores repository info (GitHub URLs, names) rather than local filesystem paths
CREATE TABLE IF NOT EXISTS repos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path            TEXT NOT NULL,          -- GitHub URL or local path
    name            TEXT NOT NULL,          -- Repository short name
    display_name    TEXT NOT NULL,          -- Full display name (e.g., owner/repo)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create project_repos table to link projects to repositories
CREATE TABLE IF NOT EXISTS project_repos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repo_id               UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    setup_script          TEXT,
    cleanup_script        TEXT,
    copy_files            TEXT,
    parallel_setup_script BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_project_repos_project_id ON project_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_project_repos_repo_id ON project_repos(repo_id);
