import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-98: Fix Lead Dropdown Opening Edit Dialog
 *
 * Bug: When selecting a lead from the dropdown, an "Edit project" dialog opens
 * instead of assigning the lead.
 *
 * Fix: Added stopPropagation to DropdownMenuContent and DropdownMenuItem
 * onClick handlers in LeadCell component.
 *
 * Note: Tests require authenticated session and team/project setup.
 */

test.describe('IKA-98: Lead Dropdown Fix', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Event Propagation Fix', () => {
    test('should assign lead without opening edit dialog', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Get the first project row
      const firstProjectRow = page.locator('tbody tr').first();

      // Click on lead dropdown trigger (the 3rd button in the row - after health, priority)
      const leadButton = firstProjectRow.locator('button').filter({
        has: page.locator('svg.lucide-chevron-down'),
      }).nth(2);
      await leadButton.click();

      // Verify dropdown is open
      const dropdown = page.locator('[role="menu"]');
      await expect(dropdown).toBeVisible();

      // Select a team member (or "No lead")
      const menuItem = page.locator('[role="menuitem"]').first();
      await menuItem.click();

      // Verify no dialog opened (the bug would open Edit Project dialog)
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).not.toBeVisible();

      // Verify URL didn't change (didn't navigate to project detail)
      await expect(page).toHaveURL('/teams/IKA/projects');
    });

    test('should not navigate to project when clicking lead dropdown item', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      const firstProjectRow = page.locator('tbody tr').first();

      // Open lead dropdown
      const leadButton = firstProjectRow.locator('button').filter({
        has: page.locator('svg.lucide-chevron-down'),
      }).nth(2);
      await leadButton.click();

      // Click on any dropdown item
      const noLeadOption = page.locator('[role="menuitem"]', { hasText: 'No lead' });
      await noLeadOption.click();

      // Should stay on the same page (no navigation)
      await expect(page).toHaveURL('/teams/IKA/projects');
    });

    test('should close dropdown after selecting lead', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      const firstProjectRow = page.locator('tbody tr').first();

      // Open lead dropdown
      const leadButton = firstProjectRow.locator('button').filter({
        has: page.locator('svg.lucide-chevron-down'),
      }).nth(2);
      await leadButton.click();

      // Verify dropdown is open
      const dropdown = page.locator('[role="menu"]');
      await expect(dropdown).toBeVisible();

      // Select a lead
      const menuItem = page.locator('[role="menuitem"]').first();
      await menuItem.click();

      // Dropdown should be closed
      await expect(dropdown).not.toBeVisible();
    });
  });

  test.describe('Lead Assignment Functionality', () => {
    test('should successfully update lead via API', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      // Intercept the update API call
      let updateCalled = false;
      await page.route('**/api/projects/*', (route) => {
        if (route.request().method() === 'PUT') {
          updateCalled = true;
        }
        route.continue();
      });

      await page.goto('/teams/IKA/projects');

      const firstProjectRow = page.locator('tbody tr').first();

      // Open lead dropdown and select a lead
      const leadButton = firstProjectRow.locator('button').filter({
        has: page.locator('svg.lucide-chevron-down'),
      }).nth(2);
      await leadButton.click();

      const menuItem = page.locator('[role="menuitem"]').first();
      await menuItem.click();

      // Wait a moment for API call
      await page.waitForTimeout(500);

      // Verify the update API was called
      expect(updateCalled).toBe(true);
    });
  });

  test.describe('Regression: Row Click Still Works', () => {
    test('should navigate to project when clicking project name', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Click on the project name cell (not the lead cell)
      const firstProjectRow = page.locator('tbody tr').first();
      const nameCell = firstProjectRow.locator('td').first();
      await nameCell.click();

      // Should navigate to project detail page
      await expect(page).toHaveURL(/\/teams\/IKA\/projects\/.+/);
    });
  });
});
