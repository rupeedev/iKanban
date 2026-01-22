-- Add sync configuration fields to github_repositories (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'sync_path') THEN
        ALTER TABLE github_repositories ADD COLUMN sync_path TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'sync_folder_id') THEN
        ALTER TABLE github_repositories ADD COLUMN sync_folder_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'last_synced_at') THEN
        ALTER TABLE github_repositories ADD COLUMN last_synced_at TIMESTAMPTZ;
    END IF;
END
$$;

-- Create index for sync_folder_id lookups
CREATE INDEX IF NOT EXISTS idx_github_repositories_sync_folder_id ON github_repositories(sync_folder_id);
