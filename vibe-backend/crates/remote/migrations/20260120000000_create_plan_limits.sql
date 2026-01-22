-- Create plan_limits table for defining resource limits per subscription plan (IKA-179)
-- This table defines what each plan (free, starter, pro, enterprise) allows

CREATE TABLE IF NOT EXISTS plan_limits (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan name (unique identifier)
    plan_name TEXT NOT NULL UNIQUE,

    -- Resource limits (-1 = unlimited)
    max_teams BIGINT NOT NULL DEFAULT 2,
    max_projects BIGINT NOT NULL DEFAULT 5,
    max_members BIGINT NOT NULL DEFAULT 3,
    max_storage_gb BIGINT NOT NULL DEFAULT 1,
    max_ai_requests_per_month BIGINT NOT NULL DEFAULT 50,

    -- Audit Trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: Not inserting default plan limits here
-- The table already has data with plan names: 'hobby', 'starter', 'pro'
-- These were inserted by migration 20260119000000
-- The CHECK constraint valid_plan_name only allows these values

-- Index for plan lookups
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_name ON plan_limits(plan_name);

-- Comment on table
COMMENT ON TABLE plan_limits IS 'Defines resource limits for each subscription plan';
COMMENT ON COLUMN plan_limits.max_teams IS 'Maximum teams allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_projects IS 'Maximum projects allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_members IS 'Maximum members allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_storage_gb IS 'Maximum storage in GB (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_ai_requests_per_month IS 'Maximum AI requests per month (-1 = unlimited)';
