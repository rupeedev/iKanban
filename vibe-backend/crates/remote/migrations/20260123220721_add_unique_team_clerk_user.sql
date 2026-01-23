-- Add unique constraint on (team_id, clerk_user_id) to support upsert for member sync
-- This allows a Clerk user to only be a member of a team once

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_clerk_user
    ON team_members (team_id, clerk_user_id)
    WHERE clerk_user_id IS NOT NULL;
