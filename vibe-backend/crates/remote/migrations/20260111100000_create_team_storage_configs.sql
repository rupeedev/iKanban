-- Team Storage Configs table for cloud storage provider configurations
-- Supports Google Drive, AWS S3, and Dropbox integrations

CREATE TABLE IF NOT EXISTS team_storage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,  -- 'google_drive', 's3', 'dropbox'
    access_token TEXT,  -- Encrypted OAuth access token
    refresh_token TEXT,  -- Encrypted OAuth refresh token
    token_expires_at TIMESTAMPTZ,
    folder_id TEXT,  -- Provider-specific folder/bucket path
    config_data JSONB NOT NULL DEFAULT '{}',  -- Provider-specific config (bucket, region, etc.)
    is_active BOOLEAN NOT NULL DEFAULT true,
    connected_email TEXT,  -- Email of connected account
    connected_account_id TEXT,  -- Provider account ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_storage_configs_team_id ON team_storage_configs(team_id);
CREATE INDEX IF NOT EXISTS idx_team_storage_configs_provider ON team_storage_configs(provider);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_storage_configs_team_provider ON team_storage_configs(team_id, provider);

-- Comments
COMMENT ON TABLE team_storage_configs IS 'Cloud storage provider configurations for teams';
COMMENT ON COLUMN team_storage_configs.provider IS 'Storage provider type: google_drive, s3, or dropbox';
COMMENT ON COLUMN team_storage_configs.config_data IS 'Provider-specific configuration as JSONB (bucket name, region, prefix for S3, etc.)';
