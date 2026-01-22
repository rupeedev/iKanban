-- Add document_storage_path column to teams table (idempotent)
-- This allows teams to configure a custom directory path for document storage

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'document_storage_path') THEN
        ALTER TABLE teams ADD COLUMN document_storage_path TEXT;
    END IF;
END
$$;

-- The path can be:
-- NULL: Use default application storage (dev_assets/documents/{team_id}/)
-- Absolute path: Store documents in the specified directory
