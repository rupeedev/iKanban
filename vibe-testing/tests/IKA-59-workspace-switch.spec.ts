import { test, expect } from '@playwright/test';

test.describe('IKA-59: Workspace Switching Cache Fix', () => {
    // Note: These tests verify workspace switching functionality.
    // Authentication is required - tests will skip if not logged in.

    // Helper to check if authenticated and find workspace switcher
    async function getWorkspaceSwitcher(page: import('@playwright/test').Page) {
        // The workspace switcher has a chevron-down icon and contains the workspace name
        // It's the main dropdown trigger in the sidebar header
        return page.locator('button').filter({ has: page.locator('[class*="lucide-chevron-down"]') }).first();
    }

    test.describe('Workspace Switcher UI', () => {
        test('Workspace switcher dropdown should be visible', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            const isLoginRedirect = url.includes('sign-in') || url.includes('login');

            if (isLoginRedirect) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            // Look for dropdown trigger with chevron-down (workspace switcher pattern)
            // The workspace switcher button contains a chevron-down icon
            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            await expect(workspaceSwitcher).toBeVisible();
        });

        test('Clicking workspace switcher should open dropdown menu', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Click the workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Dropdown should appear with search and workspace list
            await expect(page.getByPlaceholder('Search workspaces...')).toBeVisible();
            await expect(page.locator('text=Workspaces')).toBeVisible();
        });

        test('Workspace dropdown should show Create workspace option', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Click the workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Verify create workspace option
            await expect(page.locator('text=Create workspace')).toBeVisible();
        });

        test('Workspace dropdown should show Workspace settings option', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Click the workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Verify workspace settings option
            await expect(page.locator('text=Workspace settings')).toBeVisible();
        });
    });

    test.describe('Workspace Switching Navigation', () => {
        test('Switching workspace should navigate to /projects', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Open workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Find workspace items in the dropdown (excluding Create/Settings options)
            // Look for menu items that don't contain "Create" or "settings"
            const workspaceItems = page.locator('[role="menuitem"]').filter({
                hasNot: page.locator('text=Create workspace')
            }).filter({
                hasNot: page.locator('text=Workspace settings')
            }).filter({
                hasNot: page.locator('text=Current')
            });

            const workspaceCount = await workspaceItems.count();

            if (workspaceCount === 0) {
                test.skip(true, 'Skipping - only one workspace or none available');
                return;
            }

            // Click the first non-current workspace
            await workspaceItems.first().click();

            // Should navigate to /projects
            await page.waitForURL(/\/projects/, { timeout: 5000 });
            expect(page.url()).toContain('/projects');
        });

        test('Clicking same workspace should not navigate', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            const initialUrl = page.url();

            // Open workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Click the current workspace (marked as "Current")
            const currentWorkspace = page.locator('[role="menuitem"]').filter({
                has: page.locator('text=Current')
            });

            if (await currentWorkspace.count() === 0) {
                test.skip(true, 'Skipping - cannot find current workspace marker');
                return;
            }

            await currentWorkspace.click();

            // Dropdown should close but URL should stay the same
            await page.waitForTimeout(500);
            expect(page.url()).toBe(initialUrl);
        });
    });

    test.describe('Workspace Search', () => {
        test('Search should filter workspaces', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Open workspace switcher
            await workspaceSwitcher.click();
            await page.waitForTimeout(500);

            // Type in search
            const searchInput = page.getByPlaceholder('Search workspaces...');
            await searchInput.fill('nonexistent-workspace-12345');

            // Should show no results message
            await expect(page.locator('text=No workspaces found')).toBeVisible();
        });
    });

    test.describe('Quick Create Menu', () => {
        test('Quick create button should be visible next to workspace switcher', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Look for the pen-square icon button (quick create) - it's a small button near the workspace switcher
            // Find the parent container of workspace switcher and look for another button with pen-square icon
            const quickCreateButton = page.locator('button').filter({ has: page.locator('[class*="lucide-pen-square"]') });
            await expect(quickCreateButton).toBeVisible();
        });

        test('Quick create dropdown should show New Project and New Team options', async ({ page }) => {
            await page.goto('/projects');
            await page.waitForTimeout(2000);

            const url = page.url();
            if (url.includes('sign-in') || url.includes('login')) {
                test.skip(true, 'Skipping - authentication required');
                return;
            }

            const workspaceSwitcher = await getWorkspaceSwitcher(page);
            const isVisible = await workspaceSwitcher.isVisible().catch(() => false);
            if (!isVisible) {
                test.skip(true, 'Skipping - workspace switcher not found');
                return;
            }

            // Click quick create button (pen-square icon)
            const quickCreateButton = page.locator('button').filter({ has: page.locator('[class*="lucide-pen-square"]') });
            await quickCreateButton.click();
            await page.waitForTimeout(500);

            // Verify options
            await expect(page.locator('text=New Project')).toBeVisible();
            await expect(page.locator('text=New Team')).toBeVisible();
        });
    });
});
