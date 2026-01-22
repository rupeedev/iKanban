-- Create plan_limits table for subscription plan resource limits (IKA-178)
-- NOTE: Table may already exist from earlier migration with different plan names
-- This migration is idempotent - it only creates if not exists

-- Only create table if it doesn't exist
-- The earlier migration (20260119000000) may have created it with different plan names
CREATE TABLE IF NOT EXISTS plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name TEXT NOT NULL UNIQUE,
    max_teams BIGINT NOT NULL DEFAULT 2,
    max_projects BIGINT NOT NULL DEFAULT 5,
    max_members BIGINT NOT NULL DEFAULT 3,
    max_storage_gb BIGINT NOT NULL DEFAULT 1,
    max_ai_requests_per_month BIGINT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups (IF NOT EXISTS handles idempotency)
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_name ON plan_limits(plan_name);

-- NOTE: Not inserting seed data here as the table may already have data
-- with different plan names (hobby, starter, pro vs free, pro, enterprise)
-- The existing data and constraints should be preserved
