-- Add local_path field to document_folders for filesystem sync (idempotent)
-- This allows users to specify a local directory path that will be scanned
-- for markdown documents when the Scan button is clicked
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_folders' AND column_name = 'local_path') THEN
        ALTER TABLE document_folders ADD COLUMN local_path TEXT;
    END IF;
END
$$;
