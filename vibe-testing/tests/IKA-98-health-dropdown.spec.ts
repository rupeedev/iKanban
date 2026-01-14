import { test, expect } from '@playwright/test';

test.describe('IKA-98: Health dropdown cache update fix', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the projects page for iKanban team
    await page.goto('/teams/IKA/projects');
    // Wait for the projects table to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should display selected Health value immediately after selection (cache fix)', async ({ page }) => {
    // This test verifies the cache update fix in useProjectMutations.ts
    // The bug was: selecting health updated the backend but UI didn't reflect the change
    // because useProjectMutations updated ['projects'] cache but TeamProjects uses
    // ['teams', teamId, 'projects', 'full'] cache key

    // Find the first project row and its health dropdown
    const firstRow = page.locator('table tbody tr').first();
    const healthCell = firstRow.locator('td').nth(1);
    const healthButton = healthCell.locator('button');

    // Store initial state for comparison
    const initialText = await healthButton.textContent();

    // Click the health dropdown trigger
    await healthButton.click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Select a different health option - if current is "On track", select "At risk", otherwise select "On track"
    const targetOption = initialText?.includes('On track') ? 'At risk' : 'On track';
    await dropdown.locator(`text=${targetOption}`).click();

    // Verify dropdown closed
    await expect(dropdown).not.toBeVisible();

    // CRITICAL: Verify the button immediately shows the new value (this was the bug)
    await expect(healthButton).toContainText(targetOption);

    // Verify no edit dialog opened (regression check from IKA-98 lead fix)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });
});
