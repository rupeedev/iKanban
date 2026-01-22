-- IKA-215: Update plan_limits to 3-tier structure (Hobby/Starter/Pro)
-- Reference: docs-ikanban/tenancy/signup/SIGNUP-EPIC-TASKS.md

-- Step 1: Add max_workspaces column if it doesn't exist
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS max_workspaces BIGINT NOT NULL DEFAULT 1;

-- Step 2: Drop the old valid_plan_name constraint that only allows free/pro/enterprise
ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS valid_plan_name;

-- Step 3: Drop the positive_limits constraint since we need to handle -1 for unlimited
ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS positive_limits;

-- Step 4: Remove old plans (free, enterprise)
DELETE FROM plan_limits WHERE plan_name IN ('free', 'enterprise');

-- Step 5: Insert/update the 3-tier plans
INSERT INTO plan_limits (
    plan_name,
    max_workspaces,
    max_teams,
    max_projects,
    max_members,
    max_storage_gb,
    max_ai_requests_per_month
) VALUES
    -- HOBBY PLAN: Free tier for personal projects
    -- 1 workspace, 7 teams, 3 projects, 5 members, 1 GB storage, 50 AI requests
    ('hobby', 1, 7, 3, 5, 1, 50),

    -- STARTER PLAN: Small teams ($19/mo)
    -- 1 workspace, 5 teams, 10 projects, 10 members, 5 GB storage, 100 AI requests
    ('starter', 1, 5, 10, 10, 5, 100),

    -- PRO PLAN: Growing organizations ($39/mo)
    -- 3 workspaces, 10 teams, 25 projects, 25 members, 50 GB storage, 1000 AI requests
    ('pro', 3, 10, 25, 25, 50, 1000)
ON CONFLICT (plan_name) DO UPDATE SET
    max_workspaces = EXCLUDED.max_workspaces,
    max_teams = EXCLUDED.max_teams,
    max_projects = EXCLUDED.max_projects,
    max_members = EXCLUDED.max_members,
    max_storage_gb = EXCLUDED.max_storage_gb,
    max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
    updated_at = NOW();

-- Step 6: Add new constraint for valid plan names (hobby, starter, pro)
-- Use DO block to check if constraint exists first (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_plan_name'
        AND table_name = 'plan_limits'
    ) THEN
        ALTER TABLE plan_limits ADD CONSTRAINT valid_plan_name
            CHECK (plan_name IN ('hobby', 'starter', 'pro'));
    END IF;
END
$$;

-- Step 7: Add comment for new column
COMMENT ON COLUMN plan_limits.max_workspaces IS 'Maximum workspaces allowed per plan';
