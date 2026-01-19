-- Create plan_limits table for subscription plan resource limits (IKA-178)
-- This table stores the resource limits for each subscription plan (free, pro, enterprise)

CREATE TABLE IF NOT EXISTS plan_limits (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan Identifier (UNIQUE - one record per plan)
    plan_name TEXT NOT NULL UNIQUE,

    -- Resource Limits
    max_teams BIGINT NOT NULL DEFAULT 2,
    max_projects BIGINT NOT NULL DEFAULT 5,
    max_members BIGINT NOT NULL DEFAULT 3,
    max_storage_gb BIGINT NOT NULL DEFAULT 1,
    max_ai_requests_per_month BIGINT NOT NULL DEFAULT 100,

    -- Audit Trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_plan_name CHECK (plan_name IN ('free', 'pro', 'enterprise')),
    CONSTRAINT positive_limits CHECK (
        max_teams > 0 AND
        max_projects > 0 AND
        max_members > 0 AND
        max_storage_gb > 0 AND
        max_ai_requests_per_month > 0
    )
);

-- Index for fast lookups by plan name
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_limits_plan_name ON plan_limits(plan_name);

-- Seed default plan limits
-- Note: Using i64::MAX (9223372036854775807) for enterprise as "unlimited" proxy
INSERT INTO plan_limits (plan_name, max_teams, max_projects, max_members, max_storage_gb, max_ai_requests_per_month)
VALUES
    -- FREE PLAN: 2 teams, 5 projects, 3 members, 1 GB storage, 100 AI requests/month
    ('free', 2, 5, 3, 1, 100),

    -- PRO PLAN: 10 teams, 25 projects, 15 members, 50 GB storage, 1000 AI requests/month
    ('pro', 10, 25, 15, 50, 1000),

    -- ENTERPRISE PLAN: effectively unlimited (max BIGINT values)
    ('enterprise', 9223372036854775807, 9223372036854775807, 9223372036854775807, 9223372036854775807, 9223372036854775807)
ON CONFLICT (plan_name) DO NOTHING;
