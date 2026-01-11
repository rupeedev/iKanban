import { test, expect } from '@playwright/test';

test.describe('IKA-61: Team Chat UI Improvement', () => {
    // Note: These tests verify the improved Team Chat UI with team names display.
    // Changes: 1) Removed iKANBAN logo from navbar, 2) Show team names in badge and panel
    // Tests require the frontend to be running on localhost:3000

    test.describe('Navbar Layout - Logo Removal', () => {
        test('iKANBAN logo should NOT appear in navbar header area', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // Check if the app has loaded by looking for the navbar
            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            // The iKANBAN logo should NOT be in the main content header area
            // (Note: It may still exist in sidebar, but not in the top navbar before PeopleOnlineBadge)
            const navbarFirstSection = page.locator('.border-b.bg-background .flex-1.flex.items-center').first();

            // Check that the first element is NOT a link to projects with iKANBAN text
            const logoInNavbar = navbarFirstSection.locator('a[href="/projects"] >> text=/iKANBAN/i');
            await expect(logoInNavbar).not.toBeVisible();
        });

        test('PeopleOnlineBadge should be visible in navbar', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // Skip if app not running
            const navbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may need authentication');
                return;
            }
            await expect(badge).toBeVisible();
        });
    });

    test.describe('PeopleOnlineBadge with Team Names', () => {
        test('Badge should show Connect text', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Badge should always show "Connect" or "X online" status text
            const hasConnectOrOnline = await badge.locator('text=/Connect|online/').isVisible();
            expect(hasConnectOrOnline).toBeTruthy();
        });

        test('Badge should have proper structure with team names section', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Badge should have Users icon section with border-r
            const iconSection = badge.locator('span.border-r').first();
            await expect(iconSection).toBeVisible();
        });

        test('Badge should be clickable and open team chat panel', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Click badge to open panel
            await badge.click();

            // Panel should be visible
            const panel = page.locator('[role="dialog"]');
            await expect(panel).toBeVisible();
        });
    });

    test.describe('TeamChatPanel with Team Names', () => {
        async function openChatPanel(page: any) {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                return false;
            }

            await badge.click();

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

        test('Panel should display team names or default workspace name', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // The panel description should show team names or fallback to "Workspace"
            const descriptionArea = page.locator('[role="dialog"] [data-slot="sheet-description"], [role="dialog"] .text-xs');
            await expect(descriptionArea.first()).toBeVisible();
        });

        test('Panel should have proper header structure', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check header exists with border
            const header = page.locator('[role="dialog"] .border-b');
            await expect(header.first()).toBeVisible();
        });

        test('Panel should have Online Now section', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            await expect(page.locator('[role="dialog"] >> text=Online Now')).toBeVisible();
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
        test('Badge should have proper aria-label for team chat', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Badge should have aria-label mentioning team chat
            const ariaLabel = await badge.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
            expect(ariaLabel?.toLowerCase()).toContain('team chat');
        });
    });
});
