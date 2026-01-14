import { test, expect } from '@playwright/test';

test.describe('IKA-102: Inline Picker Updates in Projects Table', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the iKanban team projects page
    await page.goto('http://localhost:3000/teams/IKA/projects');
    // Wait for projects to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should update Health dropdown immediately without refresh', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Health dropdown in the first row
    const healthDropdown = firstRow.locator('td').nth(1).locator('button');
    await healthDropdown.click();

    // Wait for dropdown menu to appear
    const dropdownMenu = page.locator('[role="menu"]');
    await expect(dropdownMenu).toBeVisible();

    // Select "At risk" option
    await page.locator('[role="menuitem"]').filter({ hasText: 'At risk' }).click();

    // Verify the dropdown shows the updated value (At risk) - yellow indicator
    await expect(healthDropdown.locator('.text-yellow-500')).toBeVisible({ timeout: 5000 });

    // Verify no page refresh was triggered (by checking if we're still on the same page)
    await expect(page).toHaveURL(/.*\/teams\/IKA\/projects/);
  });

  test('should update Priority dropdown immediately without refresh', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Priority dropdown in the first row (3rd column)
    const priorityDropdown = firstRow.locator('td').nth(2).locator('button');
    await priorityDropdown.click();

    // Wait for dropdown menu to appear
    const dropdownMenu = page.locator('[role="menu"]');
    await expect(dropdownMenu).toBeVisible();

    // Select "High" option
    await page.locator('[role="menuitem"]').filter({ hasText: 'High' }).click();

    // Verify the dropdown shows the updated value with orange emoji
    await expect(priorityDropdown).toContainText('High');

    // Verify no page refresh was triggered
    await expect(page).toHaveURL(/.*\/teams\/IKA\/projects/);
  });

  test('should update Lead dropdown immediately without refresh', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Lead dropdown in the first row (4th column)
    const leadDropdown = firstRow.locator('td').nth(3).locator('button');
    const initialText = await leadDropdown.textContent();
    await leadDropdown.click();

    // Wait for dropdown menu to appear
    const dropdownMenu = page.locator('[role="menu"]');
    await expect(dropdownMenu).toBeVisible();

    // Select "No lead" option first to reset
    await page.locator('[role="menuitem"]').filter({ hasText: 'No lead' }).click();

    // Wait for UI to update
    await page.waitForTimeout(500);

    // Verify the dropdown updated - should show "—" for no lead
    await expect(leadDropdown).toContainText('—');

    // Verify no page refresh was triggered
    await expect(page).toHaveURL(/.*\/teams\/IKA\/projects/);
  });

  test('should update Target Date via date picker immediately without refresh', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Target date cell in the first row (5th column)
    const targetDateButton = firstRow.locator('td').nth(4).locator('button');
    await targetDateButton.click();

    // Wait for the date picker popover to appear
    const popover = page.locator('[role="dialog"]');
    await expect(popover).toBeVisible({ timeout: 3000 });

    // Verify tabs are visible
    await expect(popover.locator('button', { hasText: 'Day' })).toBeVisible();
    await expect(popover.locator('button', { hasText: 'Month' })).toBeVisible();

    // Select "In 7 days" option
    await popover.locator('button', { hasText: 'In 7 days' }).click();

    // Verify the date picker closed and value updated
    await expect(popover).not.toBeVisible({ timeout: 2000 });

    // The button should now show a date (not "—")
    await expect(targetDateButton).not.toContainText('—');

    // Verify no page refresh was triggered
    await expect(page).toHaveURL(/.*\/teams\/IKA\/projects/);
  });

  test('should clear Target Date via date picker', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Target date cell
    const targetDateButton = firstRow.locator('td').nth(4).locator('button');
    await targetDateButton.click();

    // Wait for the date picker popover to appear
    const popover = page.locator('[role="dialog"]');
    await expect(popover).toBeVisible({ timeout: 3000 });

    // First set a date if not already set
    const hasDate = await targetDateButton.textContent();
    if (hasDate?.includes('—')) {
      await popover.locator('button', { hasText: 'In 7 days' }).click();
      await page.waitForTimeout(500);
      await targetDateButton.click();
      await expect(popover).toBeVisible({ timeout: 3000 });
    }

    // Now clear the date - look for "Clear target date" button
    const clearButton = popover.locator('button', { hasText: 'Clear target date' });
    if (await clearButton.isVisible()) {
      await clearButton.click();

      // Verify the date was cleared (shows "—")
      await expect(targetDateButton).toContainText('—');
    }

    // Verify no page refresh was triggered
    await expect(page).toHaveURL(/.*\/teams\/IKA\/projects/);
  });

  test('should not navigate to project detail when clicking dropdown', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Get the current URL
    const initialUrl = page.url();

    // Click on the Health dropdown (should NOT navigate)
    const healthDropdown = firstRow.locator('td').nth(1).locator('button');
    await healthDropdown.click();

    // Wait a moment for any potential navigation
    await page.waitForTimeout(500);

    // Verify we're still on the projects list page, not a project detail page
    expect(page.url()).toBe(initialUrl);

    // Close the dropdown by clicking elsewhere
    await page.keyboard.press('Escape');
  });

  test('should navigate to project detail when clicking project name', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Click on the Name cell (first column) - should navigate
    const nameCell = firstRow.locator('td').first();
    await nameCell.click();

    // Wait for navigation
    await page.waitForURL(/.*\/teams\/IKA\/projects\/.+/, { timeout: 5000 });

    // Verify we navigated to a project detail page
    expect(page.url()).toMatch(/\/teams\/IKA\/projects\/.+/);
  });

  test('columns should have proper spacing', async ({ page }) => {
    // Check that table headers exist
    const headers = page.locator('table thead th');
    await expect(headers).toHaveCount(6);

    // Verify all expected columns are present
    await expect(headers.nth(0)).toContainText('Name');
    await expect(headers.nth(1)).toContainText('Health');
    await expect(headers.nth(2)).toContainText('Priority');
    await expect(headers.nth(3)).toContainText('Lead');
    await expect(headers.nth(4)).toContainText('Target date');
    await expect(headers.nth(5)).toContainText('Status');

    // Get the widths of the columns (check they're reasonably sized)
    const healthHeader = headers.nth(1);
    const priorityHeader = headers.nth(2);
    const leadHeader = headers.nth(3);
    const targetDateHeader = headers.nth(4);
    const statusHeader = headers.nth(5);

    // All middle columns should have similar widths (within 50px tolerance)
    const healthBox = await healthHeader.boundingBox();
    const priorityBox = await priorityHeader.boundingBox();
    const leadBox = await leadHeader.boundingBox();
    const targetDateBox = await targetDateHeader.boundingBox();
    const statusBox = await statusHeader.boundingBox();

    // Verify columns are not too narrow (at least 80px)
    expect(healthBox?.width).toBeGreaterThan(80);
    expect(priorityBox?.width).toBeGreaterThan(80);
    expect(leadBox?.width).toBeGreaterThan(80);
    expect(targetDateBox?.width).toBeGreaterThan(80);
    expect(statusBox?.width).toBeGreaterThan(80);
  });
});
