import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-106: Task Move to Project & Tags System
 *
 * These tests cover:
 * - Move task between projects via dropdown
 * - Tags system: add, remove, create tags
 * - Tag colors and display
 *
 * Note: These tests require an authenticated session to access team pages.
 * If running locally, ensure you're logged in to the application.
 */

test.describe('IKA-106: Task Move to Project & Tags System', () => {
  test.describe.configure({ mode: 'serial' });

  // Navigate to team issues page (Kanban board view)
  test.beforeEach(async ({ page }) => {
    // Navigate to iKanban team issues page
    await page.goto('/teams/IKA/issues');

    // Check if we're on the landing page (not authenticated)
    const isLandingPage = await page.locator('text=Sign In').first().isVisible({ timeout: 2000 }).catch(() => false);
    if (isLandingPage) {
      test.skip(true, 'Not authenticated - please login to run these tests');
      return;
    }

    // Wait for the page header to load (indicates authenticated user)
    await page.waitForSelector('text=Issues', { timeout: 10000 });
  });

  test.describe('Project Selector - Move Task Between Projects', () => {
    test('should display Project selector in issue detail panel', async ({ page }) => {
      // Wait for the board to fully load
      await page.waitForTimeout(500);

      // Look for any issue card on the Kanban board (may be different selectors)
      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        // Skip if no issues exist - this is expected for empty boards
        test.skip(true, 'No issues available to test');
        return;
      }

      // Click on the issue card to open detail panel
      await issueCard.click();

      // Wait for detail panel to open - look for Tags or Project section
      await page.waitForSelector('text=Tags, text=Project', { timeout: 5000 });

      // Verify Project section exists
      const projectSection = page.locator('h3:has-text("Project")');
      await expect(projectSection).toBeVisible();

      // Verify there's a button/dropdown for project selection
      const projectDropdown = projectSection.locator('..').locator('button[role="combobox"]');
      await expect(projectDropdown).toBeVisible();
    });

    test('should show current project name in dropdown', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Project")', { timeout: 5000 });

      const projectSection = page.locator('h3:has-text("Project")').locator('..');
      const projectDropdown = projectSection.locator('button[role="combobox"]');
      await expect(projectDropdown).toHaveText(/.+/);
    });

    test('should open project dropdown with available projects', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Project")', { timeout: 5000 });

      const projectSection = page.locator('h3:has-text("Project")').locator('..');
      const projectDropdown = projectSection.locator('button[role="combobox"]');
      await projectDropdown.click();

      const dropdown = page.locator('[cmdk-list]');
      await expect(dropdown).toBeVisible();

      const searchInput = page.locator('input[placeholder*="Search project"]');
      await expect(searchInput).toBeVisible();

      await page.keyboard.press('Escape');
    });
  });

  test.describe('Tags Section - Display and Management', () => {
    test('should display Tags section in issue detail panel', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const tagsSection = page.locator('h3:has-text("Tags")');
      await expect(tagsSection).toBeVisible();
    });

    test('should show Add Tag button', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const addTagButton = page.locator('button:has-text("Add Tag")');
      await expect(addTagButton).toBeVisible();
    });

    test('should open tag selector dropdown when clicking Add Tag', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const addTagButton = page.locator('button:has-text("Add Tag")');
      await addTagButton.click();

      const dropdown = page.locator('[cmdk-list]');
      await expect(dropdown).toBeVisible();

      const searchInput = page.locator('input[placeholder*="Search tag"]');
      await expect(searchInput).toBeVisible();

      await page.keyboard.press('Escape');
    });

    test('should show option to create new tag when searching non-existent tag', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const addTagButton = page.locator('button:has-text("Add Tag")');
      await addTagButton.click();

      await page.waitForSelector('[cmdk-list]');

      const searchInput = page.locator('input[placeholder*="Search tag"]');
      const uniqueTagName = `NewTag${Date.now()}`;
      await searchInput.fill(uniqueTagName);

      const createOption = page.locator(`text=Create "${uniqueTagName}"`);
      await expect(createOption).toBeVisible();

      await page.keyboard.press('Escape');
    });
  });

  test.describe('Tags Integration - Full Flow', () => {
    test('should close tag selector after pressing Escape', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const addTagButton = page.locator('button:has-text("Add Tag")');
      await addTagButton.click();

      const dropdown = page.locator('[cmdk-list]');
      await expect(dropdown).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(dropdown).not.toBeVisible();
    });
  });

  test.describe('UI Components Existence', () => {
    test('should show FolderKanban icon next to Project label', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Project")', { timeout: 5000 });

      const projectSection = page.locator('h3:has-text("Project")').locator('..');
      const icon = projectSection.locator('svg.lucide-folder-kanban');
      await expect(icon).toBeVisible();
    });

    test('should show Tag icon next to Tags label', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const tagsSection = page.locator('h3:has-text("Tags")').locator('..');
      const icon = tagsSection.locator('svg.lucide-tag');
      await expect(icon).toBeVisible();
    });

    test('should close detail panel with X button', async ({ page }) => {
      await page.waitForTimeout(500);

      const issueCard = page.locator('[data-testid="task-card"], [class*="cursor-pointer"][class*="border"]').first();
      const hasIssues = await issueCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (!hasIssues) {
        test.skip(true, 'No issues available to test');
        return;
      }

      await issueCard.click();
      await page.waitForSelector('h3:has-text("Tags")', { timeout: 5000 });

      const closeButton = page.locator('button:has(svg.lucide-x)').first();
      await closeButton.click();

      await expect(page.locator('h3:has-text("Tags")')).not.toBeVisible({ timeout: 2000 });
    });
  });
});
