import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-75: Move Git Connect from Header to Project Settings
 *
 * Feature: The GitHub Connect button has been removed from the top navbar and
 * relocated to the Project Settings page under the Repositories section.
 * This provides a more contextual location for managing git repository connections.
 *
 * Changes:
 * 1. Navbar no longer shows GitHub Connect button
 * 2. Project Settings → Repositories section shows GitHub connection status
 * 3. Connect/Disconnect functionality works from Project Settings
 */

test.describe('IKA-75: Git Connect Relocation', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Navbar - GitHub Connect Removed', () => {
    test('should NOT show GitHub Connect button in navbar', async ({ page }) => {
      test.skip(true, 'Requires running frontend server');

      // Navigate to any page to check the navbar
      await page.goto('/');

      // Wait for navbar to be loaded
      const navbar = page.locator('.border-b.bg-background').first();
      await expect(navbar).toBeVisible();

      // GitHub icon with "Connect" text should NOT be visible
      const connectButton = navbar.locator('button:has-text("Connect")').filter({
        has: page.locator('svg'),
      });
      await expect(connectButton).not.toBeVisible();

      // Also check there's no GitHub dropdown trigger
      const githubDropdown = navbar.locator('[class*="github"]');
      await expect(githubDropdown).not.toBeVisible();
    });

    test('should NOT show GitHub username badge in navbar when connected', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connected');

      await page.goto('/');

      const navbar = page.locator('.border-b.bg-background').first();
      await expect(navbar).toBeVisible();

      // Should not have any GitHub-related UI in navbar
      const githubBadge = navbar.locator('text=/@\\w+/'); // @username pattern
      await expect(githubBadge).not.toBeVisible();
    });
  });

  test.describe('Project Settings - GitHub Connection', () => {
    test('should show Repositories section in Project Settings', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/projects');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Select a project first (if project selector exists)
      const projectSelector = page.locator('#project-selector');
      if (await projectSelector.isVisible()) {
        await projectSelector.click();
        const firstProject = page.locator('[role="option"]').first();
        await firstProject.click();
      }

      // Repositories section should be visible
      const reposCard = page.locator('text=Repositories').first();
      await expect(reposCard).toBeVisible();
    });

    test('should show GitHub connection status in Repositories section', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Wait for the page to load
      await page.waitForLoadState('networkidle');

      // GitHub status section should be visible in Repositories card
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });
      await expect(githubSection).toBeVisible();

      // Should have either Connect button or username display
      const connectButton = githubSection.locator('button:has-text("Connect")');
      const usernameDisplay = githubSection.locator('text=/@\\w+/');

      // One of these should be visible
      const hasConnect = await connectButton.isVisible();
      const hasUsername = await usernameDisplay.isVisible();
      expect(hasConnect || hasUsername).toBeTruthy();
    });

    test('should show Connect button when GitHub is not connected', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with no GitHub connection');

      await page.goto('/settings/projects?projectId=test-project-id');

      // GitHub section
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });

      // Connect button should be visible
      const connectButton = githubSection.locator('button:has-text("Connect")');
      await expect(connectButton).toBeVisible();
    });

    test('should show username and disconnect button when GitHub is connected', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connected');

      await page.goto('/settings/projects?projectId=test-project-id');

      // GitHub section
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });

      // Username should be visible
      const usernameDisplay = githubSection.locator('text=/@\\w+/');
      await expect(usernameDisplay).toBeVisible();

      // Disconnect button (Unlink icon) should be visible
      const disconnectButton = githubSection.locator('button[title="Disconnect GitHub"]');
      await expect(disconnectButton).toBeVisible();
    });

    test('should open OAuth popup when clicking Connect', async ({ page, context }) => {
      test.skip(true, 'Requires authenticated session and OAuth endpoint');

      await page.goto('/settings/projects?projectId=test-project-id');

      // GitHub section
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });

      const connectButton = githubSection.locator('button:has-text("Connect")');

      // Listen for new page (popup)
      const popupPromise = context.waitForEvent('page');

      await connectButton.click();

      const popup = await popupPromise;
      expect(popup.url()).toContain('/api/oauth/github/authorize');
    });

    test('should show disconnect confirmation dialog', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connected');

      await page.goto('/settings/projects?projectId=test-project-id');

      // GitHub section
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });

      // Click disconnect button
      const disconnectButton = githubSection.locator('button[title="Disconnect GitHub"]');
      await disconnectButton.click();

      // Confirmation dialog should appear
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('text=Disconnect GitHub')).toBeVisible();
      await expect(dialog.locator('text=Are you sure')).toBeVisible();

      // Cancel button should be visible
      await expect(dialog.locator('button:has-text("Cancel")')).toBeVisible();

      // Disconnect button should be visible
      await expect(dialog.locator('button:has-text("Disconnect")')).toBeVisible();
    });

    test('should close disconnect dialog on Cancel', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connected');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Open disconnect dialog
      const githubSection = page.locator('.border.rounded-md.bg-muted\\/30').filter({
        has: page.locator('text=GitHub'),
      });
      const disconnectButton = githubSection.locator('button[title="Disconnect GitHub"]');
      await disconnectButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Click Cancel
      await dialog.locator('button:has-text("Cancel")').click();

      // Dialog should close
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Repository Management', () => {
    test('should show Add Repository button in Repositories section', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Add Repository button should be visible
      const addRepoButton = page.locator('button:has-text("Add Repository")');
      await expect(addRepoButton).toBeVisible();
    });

    test('should show "No repositories configured" when empty', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with no repos');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Empty state message
      const emptyMessage = page.locator('text=No repositories configured');
      await expect(emptyMessage).toBeVisible();
    });

    test('should list configured repositories', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with repos configured');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Repository list items should be visible
      const repoItems = page.locator('.flex.items-center.justify-between.p-3.border.rounded-md');
      await expect(repoItems.first()).toBeVisible();

      // Each repo should have name and path
      await expect(repoItems.first().locator('.font-medium')).toBeVisible();
      await expect(repoItems.first().locator('.text-muted-foreground')).toBeVisible();
    });

    test('should have delete button for each repository', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with repos configured');

      await page.goto('/settings/projects?projectId=test-project-id');

      // Repository items
      const repoItems = page.locator('.flex.items-center.justify-between.p-3.border.rounded-md');

      // Each should have a delete button
      const deleteButton = repoItems.first().locator('button[title="Delete repository"]');
      await expect(deleteButton).toBeVisible();
    });
  });
});
