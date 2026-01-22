-- Create agent_configs table for storing agent configurations (idempotent)
-- This enables dual storage: local files (.claude/, .github/) AND database storage

CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Agent identification
    agent_type TEXT NOT NULL, -- e.g., 'CLAUDE_CODE', 'COPILOT', 'DROID'

    -- Storage metadata
    storage_location TEXT NOT NULL, -- 'local' or 'database'
    local_path TEXT, -- Path to local config file if storage_location='local' (e.g., '.claude/profiles.json')

    -- Configuration data (JSON)
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ, -- Last sync time between local and database

    -- Constraints
    CONSTRAINT uniq_agent_configs_team_agent UNIQUE (team_id, agent_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_configs_team_id ON agent_configs(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_configs_storage_location ON agent_configs(storage_location);
