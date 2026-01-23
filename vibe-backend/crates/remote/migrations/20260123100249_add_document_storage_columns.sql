-- Add storage backend columns to documents table
-- Supports local storage and cloud providers (Supabase, S3, etc.)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_metadata JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'local';

-- Index for storage lookups
CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key);
CREATE INDEX IF NOT EXISTS idx_documents_storage_provider ON documents(storage_provider);
