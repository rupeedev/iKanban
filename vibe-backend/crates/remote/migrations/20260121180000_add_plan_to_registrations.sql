-- IKA-220: Add selected_plan and related columns to user_registrations
-- Reference: docs-ikanban/tenancy/signup/SIGNUP-EPIC-TASKS.md

-- Add new columns for plan selection during registration
ALTER TABLE user_registrations
ADD COLUMN IF NOT EXISTS selected_plan TEXT DEFAULT 'hobby',
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS use_case TEXT,
ADD COLUMN IF NOT EXISTS requested_workspace_name TEXT;

-- Add index for filtering registrations by plan
CREATE INDEX IF NOT EXISTS idx_user_registrations_selected_plan
ON user_registrations(selected_plan);

-- Add constraint for valid plan names (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_registration_plan'
        AND table_name = 'user_registrations'
    ) THEN
        ALTER TABLE user_registrations
        ADD CONSTRAINT valid_registration_plan
        CHECK (selected_plan IN ('hobby', 'starter', 'pro'));
    END IF;
END
$$;

-- Add comments for documentation
COMMENT ON COLUMN user_registrations.selected_plan IS 'Plan selected during registration: hobby, starter, or pro';
COMMENT ON COLUMN user_registrations.company_name IS 'Optional company/organization name';
COMMENT ON COLUMN user_registrations.use_case IS 'Optional description of intended use case';
COMMENT ON COLUMN user_registrations.requested_workspace_name IS 'User-requested name for their workspace';
