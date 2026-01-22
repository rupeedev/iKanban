-- Add Clerk integration fields to team_members (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE team_members ADD COLUMN clerk_user_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'avatar_url') THEN
        ALTER TABLE team_members ADD COLUMN avatar_url TEXT;
    END IF;
END
$$;

-- Create index for fast Clerk user lookups
CREATE INDEX IF NOT EXISTS idx_team_members_clerk_user_id ON team_members(clerk_user_id);
