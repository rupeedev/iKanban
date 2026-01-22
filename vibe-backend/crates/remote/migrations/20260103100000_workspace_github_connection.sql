-- Migration: Move GitHub connections from team-level to workspace-level (idempotent)
-- A workspace-level connection has team_id = NULL
-- This migration only runs if team_id column is NOT NULL (not yet migrated)

DO $$
BEGIN
    -- Check if migration is needed by seeing if team_id is nullable
    -- If team_id is already nullable, migration was already applied
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'github_connections'
        AND column_name = 'team_id'
        AND is_nullable = 'NO'
    ) THEN
        -- Drop the NOT NULL constraint on team_id to allow workspace-level connections
        ALTER TABLE github_connections ALTER COLUMN team_id DROP NOT NULL;
    END IF;
END
$$;

-- Recreate indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);

-- Add unique constraint for workspace-level connection
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;
