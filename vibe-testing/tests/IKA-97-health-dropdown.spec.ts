import { test, expect } from '@playwright/test';

test.describe('IKA-97: Inline Health/Priority/Lead dropdowns in Projects table', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the projects page for iKanban team
    await page.goto('/teams/IKA/projects');
    // Wait for the projects table to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should update Health status inline without opening dialog', async ({ page }) => {
    // Find the first project row and its health dropdown
    const firstRow = page.locator('table tbody tr').first();
    const healthCell = firstRow.locator('td').nth(1);

    // Click the health dropdown trigger
    await healthCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Select "On track" option
    await dropdown.locator('text=On track').click();

    // Verify the dialog did NOT open (no dialog overlay)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Verify the health indicator updated (green circle for "On track")
    await expect(healthCell.locator('svg circle.fill-current.text-green-500')).toBeVisible();
  });

  test('should update Priority inline without opening dialog', async ({ page }) => {
    // Find the first project row and its priority dropdown
    const firstRow = page.locator('table tbody tr').first();
    const priorityCell = firstRow.locator('td').nth(2);

    // Click the priority dropdown trigger
    await priorityCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Select "High" option
    await dropdown.locator('text=High').click();

    // Verify the dialog did NOT open
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Verify the priority icon updated (orange emoji for "High")
    await expect(priorityCell.locator('button')).toContainText('🟠');
  });

  test('should update Lead inline without opening dialog', async ({ page }) => {
    // Find the first project row and its lead dropdown
    const firstRow = page.locator('table tbody tr').first();
    const leadCell = firstRow.locator('td').nth(3);

    // Click the lead dropdown trigger
    await leadCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Select "No lead" option to clear the lead
    await dropdown.locator('text=No lead').click();

    // Verify the dialog did NOT open
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Verify the lead cell shows dash (no lead assigned)
    await expect(leadCell.locator('button')).toContainText('—');
  });

  test('should persist Health change after page refresh', async ({ page }) => {
    // Find the first project row and its health dropdown
    const firstRow = page.locator('table tbody tr').first();
    const healthCell = firstRow.locator('td').nth(1);

    // Click the health dropdown trigger
    await healthCell.locator('button').click();

    // Select "At risk" option (yellow)
    const dropdown = page.locator('[role="menu"]');
    await dropdown.locator('text=At risk').click();

    // Wait for the update to complete (API call)
    await page.waitForTimeout(1000);

    // Refresh the page
    await page.reload();

    // Wait for the table to reload
    await page.waitForSelector('table', { timeout: 10000 });

    // Verify the health status is still "At risk"
    const updatedHealthCell = page.locator('table tbody tr').first().locator('td').nth(1);
    await expect(updatedHealthCell.locator('button')).toContainText('At risk');
  });

  test('should cycle through all Health statuses', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    const healthCell = firstRow.locator('td').nth(1);

    const healthOptions = [
      { label: 'No update', colorClass: 'text-gray-400' },
      { label: 'On track', colorClass: 'text-green-500' },
      { label: 'At risk', colorClass: 'text-yellow-500' },
      { label: 'Off track', colorClass: 'text-red-500' },
    ];

    for (const option of healthOptions) {
      // Click the health dropdown
      await healthCell.locator('button').click();

      // Select the option
      const dropdown = page.locator('[role="menu"]');
      await expect(dropdown).toBeVisible();
      await dropdown.locator(`text=${option.label}`).click();

      // Verify the button text updated
      await expect(healthCell.locator('button')).toContainText(option.label);

      // Small delay to ensure API call completes
      await page.waitForTimeout(500);
    }
  });
});
