-- Create superadmins table for app-level administrators
-- Superadmins can approve/reject registration requests and access /superadmin/* routes

CREATE TABLE IF NOT EXISTS superadmins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,           -- Clerk user ID
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_superadmins_user_id ON superadmins(user_id);
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_superadmins_active ON superadmins(is_active) WHERE is_active = true;

-- Comments for documentation
COMMENT ON TABLE superadmins IS 'App-level administrators who can approve registrations and access /superadmin/* routes';
COMMENT ON COLUMN superadmins.user_id IS 'Clerk user ID for authentication';
COMMENT ON COLUMN superadmins.is_active IS 'Whether the superadmin can currently perform admin actions';
