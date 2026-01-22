-- Add slug column to documents table for human-readable URLs (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'slug') THEN
        ALTER TABLE documents ADD COLUMN slug TEXT;
    END IF;
END
$$;

-- Create index for fast slug lookups within a team
CREATE INDEX IF NOT EXISTS idx_documents_team_slug ON documents(team_id, slug);

-- Backfill existing documents with slugs generated from titles
-- Slug format: lowercase, spaces to hyphens, remove special chars
UPDATE documents SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    title, ' ', '-'), '/', '-'), ':', ''), '.', ''), ',', ''), '''', ''))
WHERE slug IS NULL;
