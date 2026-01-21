-- Add rupeshpanwar43@gmail.com as superadmin
-- This finds the Clerk user_id from tenant_workspace_members

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
