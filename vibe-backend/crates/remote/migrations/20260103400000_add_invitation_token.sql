-- Add token column to team_invitations for shareable invite links (idempotent)
-- Note: PostgreSQL supports ADD COLUMN IF NOT EXISTS syntax since version 11
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_invitations' AND column_name = 'token') THEN
        ALTER TABLE team_invitations ADD COLUMN token TEXT;
    END IF;
END
$$;

-- Create unique index for faster token lookups and uniqueness constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token) WHERE token IS NOT NULL;
