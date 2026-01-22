-- Add slug field to teams for multi-tenant database naming (idempotent)
-- Slug is used for database file naming: team-{slug}.sqlite

-- Add slug column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'slug') THEN
        ALTER TABLE teams ADD COLUMN slug TEXT;
    END IF;
END
$$;

-- Create unique index for slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- Generate initial slugs from existing team names
-- Convert name to lowercase, replace spaces with dashes, remove non-alphanumeric except dashes
UPDATE teams
SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '_', '-'), '.', '-'))
WHERE slug IS NULL;
