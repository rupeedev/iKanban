-- Migration: Move GitHub connections from team-level to workspace-level (idempotent)
-- A workspace-level connection has team_id = NULL

-- Step 1: Create new table with nullable team_id (PostgreSQL version)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'github_connections_new') THEN
        -- Only proceed if we need to migrate the old table
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'github_connections') THEN
            CREATE TABLE github_connections_new (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                team_id         UUID,  -- NULL for workspace-level connection
                access_token    TEXT NOT NULL,
                github_username TEXT,
                connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            -- Copy existing connections (will be migrated to workspace level)
            INSERT INTO github_connections_new (id, team_id, access_token, github_username, connected_at, updated_at)
            SELECT id, NULL, access_token, github_username, connected_at, updated_at
            FROM github_connections
            LIMIT 1;  -- Only take one connection to be the workspace connection

            -- Drop old table and rename new one
            DROP TABLE github_connections;
            ALTER TABLE github_connections_new RENAME TO github_connections;
        END IF;
    END IF;
END
$$;

-- Recreate indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);

-- Add unique constraint for workspace-level connection
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;
