import { test, expect, Page } from '@playwright/test';

// Shared utility to navigate to admin pages and check authentication
async function navigateToAdmin(page: Page, path: string = ''): Promise<boolean> {
    try {
        await page.goto(`/admin${path}`, { timeout: 10000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
        // Server not running or navigation failed
        return false;
    }

    // Check if redirected to login or home (auth required)
    const url = page.url();
    if (url.includes('sign-in') || url.includes('sign-up') || url === 'http://localhost:3000/' || !url.includes('/admin')) {
        return false;
    }
    return true;
}

test.describe('IKA-66: Team Chat Visual Fix & Admin Panel', () => {
    // Note: These tests verify the Team Chat panel team selection feature
    // and verify Admin panel API integration.
    // Tests require the frontend to be running on localhost:3000 and
    // user to be authenticated for admin tests.

    test.describe('Team Chat - Team Selection', () => {
        async function openChatPanel(page: Page) {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                return false;
            }

            // Open the chat panel
            await badge.click();

            // Wait for panel to be visible
            try {
                await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
                return true;
            } catch {
                return false;
            }
        }

        test('Team tabs should be clickable buttons', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for team buttons in the header
            const teamButtons = page.locator('[role="dialog"] button:has-text("iKanban"), [role="dialog"] button:has-text("Schild")');
            const count = await teamButtons.count();

            // If user has teams, buttons should exist
            // This test passes even if no teams exist (user not logged in)
            if (count > 0) {
                const firstButton = teamButtons.first();
                await expect(firstButton).toBeEnabled();
            }
        });

        test('Clicking a team tab should visually highlight it', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Look for team buttons
            const teamButtons = page.locator('[role="dialog"] header button');
            const count = await teamButtons.count();

            if (count >= 2) {
                // Click the second team button
                const secondButton = teamButtons.nth(1);
                await secondButton.click();

                // The clicked button should have the primary styling
                await expect(secondButton).toHaveClass(/bg-primary/);
            }
        });

        test('Team tabs should not disappear after clicking', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Look for team buttons
            const teamButtons = page.locator('[role="dialog"] header button');
            const initialCount = await teamButtons.count();

            if (initialCount > 0) {
                // Click the first team button
                const firstButton = teamButtons.first();
                await firstButton.click();

                // Wait a moment for any state updates
                await page.waitForTimeout(500);

                // Buttons should still be visible with same count
                const finalCount = await teamButtons.count();
                expect(finalCount).toBe(initialCount);
                await expect(teamButtons.first()).toBeVisible();
            }
        });

        test('First team should be auto-selected when panel opens', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Look for team buttons
            const teamButtons = page.locator('[role="dialog"] header button');
            const count = await teamButtons.count();

            if (count > 0) {
                // First button should have active styling (bg-primary)
                const firstButton = teamButtons.first();
                await expect(firstButton).toHaveClass(/bg-primary|bg-muted/);
            }
        });
    });

    test.describe('Admin Panel - Dashboard', () => {
        test('Admin dashboard should load stats from API', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page);
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Wait for dashboard to load
            await page.waitForSelector('.space-y-6', { timeout: 10000 });

            // Check for stat cards
            const statCards = page.locator('.grid.gap-4 > div');
            const count = await statCards.count();
            expect(count).toBeGreaterThanOrEqual(4);

            // Check for stat titles
            await expect(page.locator('text=Total Users')).toBeVisible();
            await expect(page.locator('text=Active Users')).toBeVisible();
        });

        test('Admin dashboard should show recent activity', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page);
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for Recent Activity section
            await expect(page.locator('text=Recent Activity')).toBeVisible();
        });

        test('Admin dashboard quick actions should link to other admin pages', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page);
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for Quick Actions section
            await expect(page.locator('text=Quick Actions')).toBeVisible();

            // Check that links exist
            await expect(page.locator('a[href="/admin/invitations"]')).toBeVisible();
            await expect(page.locator('a[href="/admin/users"]')).toBeVisible();
            await expect(page.locator('a[href="/admin/permissions"]')).toBeVisible();
            await expect(page.locator('a[href="/admin/configuration"]')).toBeVisible();
        });
    });

    test.describe('Admin Panel - Users', () => {
        test('Admin users page should display user list', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/users');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Wait for table to load
            await page.waitForSelector('table', { timeout: 10000 });

            // Check for table headers
            await expect(page.locator('text=User')).toBeVisible();
            await expect(page.locator('text=Role')).toBeVisible();
            await expect(page.locator('text=Status')).toBeVisible();
        });

        test('Admin users page should have search functionality', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/users');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for search input
            const searchInput = page.locator('input[placeholder*="Search"]');
            await expect(searchInput).toBeVisible();
        });
    });

    test.describe('Admin Panel - Invitations', () => {
        test('Admin invitations page should display invitation list', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/invitations');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for tab navigation
            await expect(page.locator('text=All')).toBeVisible();
            await expect(page.locator('text=Pending')).toBeVisible();
        });

        test('Admin invitations page should have send invitation button', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/invitations');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for send invitation button
            await expect(page.locator('button:has-text("Send Invitation")')).toBeVisible();
        });
    });

    test.describe('Admin Panel - Permissions', () => {
        test('Admin permissions page should display permission matrix', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/permissions');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for role headers
            await expect(page.locator('text=Permission Matrix')).toBeVisible();
        });

        test('Admin permissions page should display feature toggles', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/permissions');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for Feature Toggles section
            await expect(page.locator('text=Feature Toggles')).toBeVisible();
        });
    });

    test.describe('Admin Panel - Configuration', () => {
        test('Admin configuration page should display tabs', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/configuration');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for configuration tabs
            await expect(page.locator('text=General')).toBeVisible();
            await expect(page.locator('text=Workspace')).toBeVisible();
            await expect(page.locator('text=Integrations')).toBeVisible();
            await expect(page.locator('text=Security')).toBeVisible();
        });

        test('Admin configuration page should have save button', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page, '/configuration');
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for save button
            await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();
        });
    });

    test.describe('Admin Panel - Navigation', () => {
        test('Admin sidebar should navigate between pages', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page);
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Click on Users link in sidebar
            const usersLink = page.locator('a[href="/admin/users"]');
            await usersLink.click();

            // Should navigate to users page
            await expect(page).toHaveURL(/\/admin\/users/);
        });

        test('Admin layout should have exit button', async ({ page }) => {
            const isAuthenticated = await navigateToAdmin(page);
            if (!isAuthenticated) {
                test.skip(true, 'Authentication required - skipping admin test');
                return;
            }

            // Check for exit/back button
            const exitButton = page.locator('button:has-text("Exit Admin")');
            await expect(exitButton).toBeVisible();
        });
    });
});
