-- Fix superadmin entry for rupeshpanwar43@gmail.com
-- Previous migration may have failed if email wasn't in tenant_workspace_members
-- This migration directly inserts/updates using the Clerk user_id from users table

-- First try to get user_id from users table (more reliable than tenant_workspace_members)
INSERT INTO superadmins (user_id, email, name, is_active)
SELECT
    id AS user_id,
    'rupeshpanwar43@gmail.com',
    'Rupesh Panwar',
    true
FROM users
WHERE email = 'rupeshpanwar43@gmail.com'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();

-- If still not found (user may have different email in users table),
-- try to insert with a direct Clerk ID lookup pattern
-- This is a fallback that uses the known Clerk user_id pattern
INSERT INTO superadmins (user_id, email, name, is_active)
SELECT
    user_id,
    'rupeshpanwar43@gmail.com',
    'Rupesh Panwar',
    true
FROM tenant_workspace_members
WHERE email = 'rupeshpanwar43@gmail.com'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();
