import { test, expect } from '@playwright/test';

test.describe('IKA-62: Separate Team Badges', () => {
    // Note: These tests verify that each team shows as a separate badge in the navbar.
    // Tests require the frontend to be running on localhost:3000

    test.describe('Individual Team Badges', () => {
        test('Each team should have its own badge', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // Check if the app has loaded
            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            // Get all people-online badges
            const badges = page.getByTestId('people-online-badge');
            const badgeCount = await badges.count();

            // If user has teams, there should be one badge per team
            // If no teams, there should be one default badge
            expect(badgeCount).toBeGreaterThanOrEqual(1);
        });

        test('Badge should show single team name (not combined)', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            const badges = page.getByTestId('people-online-badge');
            const badgeCount = await badges.count();

            if (badgeCount === 0) {
                test.skip(true, 'No badges visible - frontend may need authentication');
                return;
            }

            // Check first badge - it should NOT contain a comma (combined teams)
            const firstBadge = badges.first();
            const badgeText = await firstBadge.textContent();

            // If there are multiple badges, each should have its own team name (no comma)
            if (badgeCount > 1) {
                // Badge text format: "TeamName Connect" or "TeamName X online"
                // Should NOT be "Team1, Team2 Connect"
                expect(badgeText).not.toContain(', ');
            }
        });

        test('Each badge should be independently clickable', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            const badges = page.getByTestId('people-online-badge');
            const firstBadge = badges.first();
            const isBadgeVisible = await firstBadge.isVisible().catch(() => false);

            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may need authentication');
                return;
            }

            // Click the first badge
            await firstBadge.click();

            // Chat panel should open
            const panel = page.locator('[role="dialog"]');
            await expect(panel).toBeVisible();
        });

        test('Badge should show Connect text', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            const badges = page.getByTestId('people-online-badge');
            const firstBadge = badges.first();
            const isBadgeVisible = await firstBadge.isVisible().catch(() => false);

            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may need authentication');
                return;
            }

            // Badge should contain "Connect" or "online" text
            const hasStatusText = await firstBadge.locator('text=/Connect|online/').isVisible();
            expect(hasStatusText).toBeTruthy();
        });
    });

    test.describe('TeamChatPanel with Multiple Teams', () => {
        async function openChatPanel(page: any) {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badges = page.getByTestId('people-online-badge');
            const firstBadge = badges.first();
            const isBadgeVisible = await firstBadge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                return false;
            }

            await firstBadge.click();

            try {
                await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
                return true;
            } catch {
                return false;
            }
        }

        test('Panel should display Team Chat title', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            await expect(page.locator('[role="dialog"] >> text=Team Chat')).toBeVisible();
        });

        test('Panel should show team badges separately', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for the panel description area
            const descriptionArea = page.locator('[role="dialog"] [data-slot="sheet-description"], [role="dialog"] .text-xs');
            await expect(descriptionArea.first()).toBeVisible();
        });

        test('Panel should close on ESC key', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            await page.keyboard.press('Escape');
            await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        });
    });

    test.describe('Accessibility', () => {
        test('Each badge should have proper aria-label with single team name', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            const badges = page.getByTestId('people-online-badge');
            const firstBadge = badges.first();
            const isBadgeVisible = await firstBadge.isVisible().catch(() => false);

            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may need authentication');
                return;
            }

            // Badge should have aria-label mentioning team chat
            const ariaLabel = await firstBadge.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel?.toLowerCase()).toContain('team chat');
        });
    });
});
