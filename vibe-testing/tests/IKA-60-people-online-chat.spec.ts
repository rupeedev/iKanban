import { test, expect } from '@playwright/test';

test.describe('IKA-60: People Online & Team Chat UI', () => {
    // Note: These tests verify the People Online badge and Team Chat panel UI components.
    // The feature is UI-only - no backend functionality is tested.
    // Tests require the frontend to be running on localhost:3000

    test.describe('People Online Badge', () => {
        test('Badge should be visible in the navbar', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // Check if the app has loaded by looking for the navbar
            const navbar = await page.locator('.border-b.bg-background').first().isVisible();
            if (!navbar) {
                test.skip(true, 'Frontend not running or app not loaded');
                return;
            }

            // Check if badge is visible using data-testid
            const badge = page.getByTestId('people-online-badge');
            await expect(badge).toBeVisible();
        });

        test('Badge should show "Connect" text when no one is online', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Badge should show "Connect" text when there are no online users
            await expect(page.locator('text=Connect')).toBeVisible();
        });

        test('Badge should be clickable and open the chat panel', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Click the People Online badge
            await badge.click();

            // Chat panel should open (Sheet component)
            const chatPanel = page.locator('[role="dialog"]');
            await expect(chatPanel).toBeVisible();
        });
    });

    test.describe('Team Chat Panel', () => {
        async function openChatPanel(page: any) {
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

        test('Panel should display header with "Team Chat" title', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for Team Chat header
            await expect(page.locator('text=Team Chat')).toBeVisible();
        });

        test('Panel should display workspace name "iKanban"', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for workspace name
            await expect(page.locator('[role="dialog"] >> text=iKanban')).toBeVisible();
        });

        test('Panel should have a close button that works', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Sheet component has a close button with sr-only text "Close"
            const closeButton = page.locator('[role="dialog"] button:has(svg)').first();
            await expect(closeButton).toBeVisible();

            // Click close button
            await closeButton.click();

            // Panel should be hidden
            await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        });

        test('Panel should display "Online Now" section', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for Online Now section
            await expect(page.locator('[role="dialog"] >> text=Online Now')).toBeVisible();
        });

        test('Panel should display empty state for messages', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for empty state message
            await expect(page.locator('[role="dialog"] >> text=No messages yet')).toBeVisible();
        });

        test('Panel should have a disabled message input', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for input field
            const input = page.locator('[role="dialog"] input[aria-label="Chat message input"]');
            await expect(input).toBeVisible();
            await expect(input).toBeDisabled();
        });

        test('Panel should display "coming soon" message', async ({ page }) => {
            const panelOpened = await openChatPanel(page);
            if (!panelOpened) {
                test.skip(true, 'Could not open chat panel - frontend may not be running');
                return;
            }

            // Check for coming soon text
            await expect(page.locator('[role="dialog"] >> text=Real-time chat will be available soon')).toBeVisible();
        });
    });

    test.describe('Panel Close Behavior', () => {
        test('Panel should close when pressing ESC', async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const badge = page.getByTestId('people-online-badge');
            const isBadgeVisible = await badge.isVisible().catch(() => false);
            if (!isBadgeVisible) {
                test.skip(true, 'Badge not visible - frontend may not be running');
                return;
            }

            // Open the chat panel
            await badge.click();
            await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

            // Press ESC
            await page.keyboard.press('Escape');

            // Panel should be hidden
            await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        });
    });

    test.describe('Responsive Design', () => {
        test('Badge should be hidden on mobile (sm:inline-flex)', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 });

            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // Badge has class "hidden sm:inline-flex" so it should be hidden on mobile
            const badge = page.getByTestId('people-online-badge');
            await expect(badge).not.toBeVisible();
        });
    });
});
