import { test, expect } from '@playwright/test';

test.describe('IKA-101: Target Date Inline Picker', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Projects page
    await page.goto('/teams/IKA/projects');
    // Wait for projects to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should display Target Date column with clickable cells', async ({ page }) => {
    // Verify the Target Date column header exists
    const header = page.locator('th', { hasText: 'Target date' });
    await expect(header).toBeVisible();

    // Find a Target Date cell (calendar icon button)
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await expect(targetDateCell).toBeVisible();
  });

  test('should open popover when clicking Target Date cell', async ({ page }) => {
    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Verify the popover opens with tabs
    const popover = page.locator('[role="tablist"]');
    await expect(popover).toBeVisible();

    // Verify tab buttons exist
    await expect(page.getByRole('tab', { name: 'Day' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Quarter' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Half' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Year' })).toBeVisible();
  });

  test('should show quick date options in Day tab', async ({ page }) => {
    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Day tab should be active by default
    const dayTab = page.getByRole('tab', { name: 'Day' });
    await expect(dayTab).toHaveAttribute('data-state', 'active');

    // Verify quick date options
    await expect(page.getByRole('button', { name: 'In 1 day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 3 days' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 7 days' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 14 days' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 30 days' })).toBeVisible();
  });

  test('should switch between tabs and show different options', async ({ page }) => {
    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Click Month tab
    await page.getByRole('tab', { name: 'Month' }).click();
    await expect(page.getByRole('button', { name: 'In 1 month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 6 months' })).toBeVisible();

    // Click Quarter tab
    await page.getByRole('tab', { name: 'Quarter' }).click();
    await expect(page.getByRole('button', { name: 'In 1 quarter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 4 quarters' })).toBeVisible();

    // Click Year tab
    await page.getByRole('tab', { name: 'Year' }).click();
    await expect(page.getByRole('button', { name: 'In 1 year' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In 3 years' })).toBeVisible();
  });

  test('should display calendar picker below tabs', async ({ page }) => {
    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Verify calendar is visible
    const calendar = page.locator('[role="grid"]');
    await expect(calendar).toBeVisible();
  });

  test('should set target date via quick option and update inline', async ({ page }) => {
    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Click "In 7 days" option
    await page.getByRole('button', { name: 'In 7 days' }).click();

    // Popover should close
    await expect(page.locator('[role="tablist"]')).not.toBeVisible();

    // The button should now show a formatted date (not the dash)
    // Wait for the update to complete
    await page.waitForTimeout(500);

    // Verify the cell now shows a date format (e.g., "Jan 21" instead of "—")
    const updatedCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    const cellText = await updatedCell.textContent();
    expect(cellText).not.toContain('—');
  });

  test('should show Clear button when date is set', async ({ page }) => {
    // First, set a date
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();
    await page.getByRole('button', { name: 'In 7 days' }).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Reopen the popover
    await targetDateCell.click();

    // Should see the clear button
    const clearButton = page.getByRole('button', { name: 'Clear target date' });
    await expect(clearButton).toBeVisible();
  });

  test('should clear target date when clicking Clear button', async ({ page }) => {
    // First, set a date
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();
    await page.getByRole('button', { name: 'In 7 days' }).click();

    // Wait for update
    await page.waitForTimeout(500);

    // Reopen the popover
    await targetDateCell.click();

    // Click clear button
    await page.getByRole('button', { name: 'Clear target date' }).click();

    // Wait for update
    await page.waitForTimeout(500);

    // The cell should show dash again
    const cellText = await targetDateCell.textContent();
    expect(cellText).toContain('—');
  });

  test('should not navigate to project when clicking Target Date cell', async ({ page }) => {
    const initialUrl = page.url();

    // Click on the Target Date cell
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();

    // Wait a moment
    await page.waitForTimeout(300);

    // URL should not have changed (should still be on projects page)
    expect(page.url()).toBe(initialUrl);
  });

  test('should persist target date change after page refresh', async ({ page }) => {
    // Set a date
    const targetDateCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    await targetDateCell.click();
    await page.getByRole('button', { name: 'In 14 days' }).click();

    // Wait for API call to complete
    await page.waitForTimeout(1000);

    // Get the date text before refresh
    const dateTextBefore = await targetDateCell.textContent();
    expect(dateTextBefore).not.toContain('—');

    // Refresh the page
    await page.reload();

    // Wait for page to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Find the same cell and verify date persisted
    const refreshedCell = page.locator('button').filter({ has: page.locator('svg.lucide-calendar-days') }).first();
    const dateTextAfter = await refreshedCell.textContent();

    // Date should still be set (not dash)
    expect(dateTextAfter).not.toContain('—');
  });
});
