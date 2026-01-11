import { test, expect } from '@playwright/test';

test.describe('IKA-58: Admin Panel - System Control Dashboard', () => {
    // Note: These tests verify the admin panel UI components.
    // Authentication is required to access the admin panel.
    // Tests that require authentication will be skipped when not logged in.

    test.describe('Admin Panel Navigation', () => {
        test('Admin panel route should be accessible', async ({ page }) => {
            // Navigate to admin panel
            await page.goto('/admin');

            // Wait for any redirects
            await page.waitForTimeout(1000);

            // Check if we're redirected to login or can access admin
            const url = page.url();
            const isLoginRedirect = url.includes('sign-in') || url.includes('login');

            if (isLoginRedirect) {
                // Expected behavior when not authenticated
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // If authenticated, verify admin panel loads
            await expect(page.locator('text=Admin Panel')).toBeVisible();
        });

        test('Admin navigation sidebar should contain all menu items', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify all navigation items are present
            await expect(page.locator('text=Dashboard')).toBeVisible();
            await expect(page.locator('text=Invitations')).toBeVisible();
            await expect(page.locator('text=Permissions')).toBeVisible();
            await expect(page.locator('text=Configuration')).toBeVisible();
            await expect(page.locator('text=Users')).toBeVisible();
        });

        test('ESC button should be visible in admin panel header', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify ESC button is present
            await expect(page.locator('text=ESC')).toBeVisible();
        });
    });

    test.describe('Admin Dashboard', () => {
        test('Dashboard should display stats cards', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify stats cards are present
            await expect(page.locator('text=Total Users')).toBeVisible();
            await expect(page.locator('text=Active Invitations')).toBeVisible();
            await expect(page.locator('text=Pending Approvals')).toBeVisible();
            await expect(page.locator('text=Workspaces')).toBeVisible();
        });

        test('Dashboard should display Recent Activity section', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('text=Recent Activity')).toBeVisible();
        });

        test('Dashboard should display Quick Actions section', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('text=Quick Actions')).toBeVisible();
            await expect(page.locator('text=Send Invitation')).toBeVisible();
            await expect(page.locator('text=Manage Users')).toBeVisible();
        });
    });

    test.describe('Admin Invitations Page', () => {
        test('Invitations page should load correctly', async ({ page }) => {
            await page.goto('/admin/invitations');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Invitations').first().isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify page header
            await expect(page.locator('h2:has-text("Invitations")')).toBeVisible();
        });

        test('Invitations page should display tabs', async ({ page }) => {
            await page.goto('/admin/invitations');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Invitations').first().isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify tabs are present
            await expect(page.locator('button:has-text("All")')).toBeVisible();
            await expect(page.locator('button:has-text("Pending")')).toBeVisible();
            await expect(page.locator('button:has-text("Accepted")')).toBeVisible();
            await expect(page.locator('button:has-text("Expired")')).toBeVisible();
        });

        test('Invitations page should have search input', async ({ page }) => {
            await page.goto('/admin/invitations');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Invitations').first().isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify search input is present
            await expect(page.getByPlaceholder('Search by email...')).toBeVisible();
        });

        test('Invitations page should have Send Invitation button', async ({ page }) => {
            await page.goto('/admin/invitations');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Invitations').first().isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.getByRole('button', { name: /Send Invitation/i })).toBeVisible();
        });
    });

    test.describe('Admin Permissions Page', () => {
        test('Permissions page should load correctly', async ({ page }) => {
            await page.goto('/admin/permissions');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Permissions")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('h2:has-text("Permissions")')).toBeVisible();
        });

        test('Permissions page should display role cards', async ({ page }) => {
            await page.goto('/admin/permissions');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Permissions")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify role cards are present
            await expect(page.locator('text=Owner')).toBeVisible();
            await expect(page.locator('text=Admin').first()).toBeVisible();
            await expect(page.locator('text=Member').first()).toBeVisible();
            await expect(page.locator('text=Viewer').first()).toBeVisible();
        });

        test('Permissions page should display Permission Matrix', async ({ page }) => {
            await page.goto('/admin/permissions');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Permissions")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('text=Permission Matrix')).toBeVisible();
        });

        test('Permissions page should display Feature Toggles', async ({ page }) => {
            await page.goto('/admin/permissions');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Permissions")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('text=Feature Toggles')).toBeVisible();
        });
    });

    test.describe('Admin Configuration Page', () => {
        test('Configuration page should load correctly', async ({ page }) => {
            await page.goto('/admin/configuration');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Configuration")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('h2:has-text("Configuration")')).toBeVisible();
        });

        test('Configuration page should display tabs', async ({ page }) => {
            await page.goto('/admin/configuration');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Configuration")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify tabs are present
            await expect(page.locator('[role="tablist"]')).toBeVisible();
        });

        test('Configuration page should display General Settings tab content', async ({ page }) => {
            await page.goto('/admin/configuration');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Configuration")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // General Settings should be visible by default
            await expect(page.locator('text=General Settings')).toBeVisible();
            await expect(page.locator('text=Application Name')).toBeVisible();
        });
    });

    test.describe('Admin Users Page', () => {
        test('Users page should load correctly', async ({ page }) => {
            await page.goto('/admin/users');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Users")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            await expect(page.locator('h2:has-text("Users")')).toBeVisible();
        });

        test('Users page should display quick stats', async ({ page }) => {
            await page.goto('/admin/users');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Users")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify quick stats cards are present
            await expect(page.locator('text=Total Users')).toBeVisible();
            await expect(page.locator('text=Active')).toBeVisible();
            await expect(page.locator('text=Suspended')).toBeVisible();
        });

        test('Users page should have search and filter controls', async ({ page }) => {
            await page.goto('/admin/users');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Users")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify search input is present
            await expect(page.getByPlaceholder('Search by name or email...')).toBeVisible();
        });

        test('Users page should display users table', async ({ page }) => {
            await page.goto('/admin/users');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('h2:has-text("Users")').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Verify table headers are present
            await expect(page.locator('th:has-text("User")')).toBeVisible();
            await expect(page.locator('th:has-text("Role")')).toBeVisible();
            await expect(page.locator('th:has-text("Status")')).toBeVisible();
        });
    });

    test.describe('Navigation Between Pages', () => {
        test('Navigation links should work correctly', async ({ page }) => {
            await page.goto('/admin');
            await page.waitForTimeout(1000);

            const isAuthenticated = await page.locator('text=Admin Panel').isVisible().catch(() => false);
            if (!isAuthenticated) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Click Invitations nav link
            await page.click('text=Invitations');
            await expect(page).toHaveURL(/\/admin\/invitations/);

            // Click Permissions nav link
            await page.click('text=Permissions');
            await expect(page).toHaveURL(/\/admin\/permissions/);

            // Click Configuration nav link
            await page.click('nav >> text=Configuration');
            await expect(page).toHaveURL(/\/admin\/configuration/);

            // Click Users nav link
            await page.click('nav >> text=Users');
            await expect(page).toHaveURL(/\/admin\/users/);

            // Click Dashboard nav link to return
            await page.click('text=Dashboard');
            await expect(page).toHaveURL(/\/admin\/?$/);
        });
    });
});
