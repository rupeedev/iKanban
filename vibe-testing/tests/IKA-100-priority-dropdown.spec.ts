import { test, expect } from '@playwright/test';

test.describe('IKA-100: Fix priority dropdown opening edit project dialog', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the projects page for iKanban team
    await page.goto('/teams/IKA/projects');
    // Wait for the projects table to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('clicking Priority dropdown should NOT open Edit Project dialog', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();
    const priorityCell = firstRow.locator('td').nth(2);

    // Click the priority dropdown trigger
    await priorityCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Verify the Edit Project dialog did NOT open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).not.toBeVisible();

    // Verify we're still on the same URL (didn't navigate away)
    expect(page.url()).toContain('/teams/IKA/projects');
  });

  test('clicking Health dropdown should NOT open Edit Project dialog', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();
    const healthCell = firstRow.locator('td').nth(1);

    // Click the health dropdown trigger
    await healthCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Verify the Edit Project dialog did NOT open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).not.toBeVisible();

    // Verify we're still on the same URL
    expect(page.url()).toContain('/teams/IKA/projects');
  });

  test('clicking Lead dropdown should NOT open Edit Project dialog', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();
    const leadCell = firstRow.locator('td').nth(3);

    // Click the lead dropdown trigger
    await leadCell.locator('button').click();

    // Wait for dropdown menu to appear
    const dropdown = page.locator('[role="menu"]');
    await expect(dropdown).toBeVisible();

    // Verify the Edit Project dialog did NOT open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).not.toBeVisible();

    // Verify we're still on the same URL
    expect(page.url()).toContain('/teams/IKA/projects');
  });

  test('selecting a priority value should update inline without dialog', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();
    const priorityCell = firstRow.locator('td').nth(2);

    // Click the priority dropdown trigger
    await priorityCell.locator('button').click();

    // Select "High" option
    const dropdown = page.locator('[role="menu"]');
    await dropdown.locator('text=High').click();

    // Verify dialog did NOT open after selection
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Verify the priority updated (shows High emoji)
    await expect(priorityCell.locator('button')).toContainText('High');
  });

  test('clicking project name/row should navigate to detail page', async ({ page }) => {
    // Find the first project row
    const firstRow = page.locator('table tbody tr').first();

    // Get the project name for verification
    const projectName = await firstRow.locator('td').first().textContent();

    // Click on the project name cell (should navigate)
    await firstRow.locator('td').first().click();

    // Verify navigation to project detail page
    await expect(page).toHaveURL(/\/teams\/IKA\/projects\/.+/);

    // The page should show project details (not the projects list)
    await expect(page.locator('h1, h2, h3').first()).toContainText(/Projects|Overview|Issues/i);
  });
});
