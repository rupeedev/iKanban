import { test, expect } from '@playwright/test';

test.describe('IKA-104: Project Table Edit & Resize', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Team Projects page
    await page.goto('/teams/IKA/projects');
    // Wait for either the projects table or auth redirect
    await page.waitForTimeout(3000);
  });

  test.describe('Edit Project Name', () => {
    test('should show edit icon on hover over project name', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the first project row name cell
      const nameCell = page.locator('table tbody tr').first().locator('td').first();

      // Hover over the name cell
      await nameCell.hover();

      // The pencil icon should become visible (it's hidden by default)
      const editButton = nameCell.locator('button[aria-label="Edit project name"]');
      await expect(editButton).toBeVisible();
    });

    test('should enable edit mode when clicking edit icon', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the first project row name cell
      const nameCell = page.locator('table tbody tr').first().locator('td').first();

      // Hover over the name cell to reveal the edit button
      await nameCell.hover();

      // Click the edit button
      const editButton = nameCell.locator('button[aria-label="Edit project name"]');
      await editButton.click();

      // An input field should now be visible in the cell
      const input = nameCell.locator('input');
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
    });

    test('should save name change on Enter key', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the first project row name cell
      const nameCell = page.locator('table tbody tr').first().locator('td').first();

      // Get the current project name
      const originalName = await nameCell.locator('span').nth(1).textContent();

      // Hover and click edit button
      await nameCell.hover();
      const editButton = nameCell.locator('button[aria-label="Edit project name"]');
      await editButton.click();

      // Clear and type new name
      const input = nameCell.locator('input');
      await input.fill(`${originalName} - Test`);

      // Press Enter to save
      await input.press('Enter');

      // Wait for input to disappear (edit mode ended)
      await expect(input).not.toBeVisible();

      // The name should be updated (verify the text is visible)
      await expect(nameCell).toContainText(`${originalName} - Test`);

      // Restore the original name for cleanup
      await nameCell.hover();
      await editButton.click();
      const inputAgain = nameCell.locator('input');
      await inputAgain.fill(originalName || '');
      await inputAgain.press('Enter');
    });

    test('should cancel edit and restore original name on Escape key', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the first project row name cell
      const nameCell = page.locator('table tbody tr').first().locator('td').first();

      // Get the current project name
      const originalName = await nameCell.locator('span').nth(1).textContent();

      // Hover and click edit button
      await nameCell.hover();
      const editButton = nameCell.locator('button[aria-label="Edit project name"]');
      await editButton.click();

      // Type a new name
      const input = nameCell.locator('input');
      await input.fill('Changed Name That Should Not Save');

      // Press Escape to cancel
      await input.press('Escape');

      // Wait for input to disappear
      await expect(input).not.toBeVisible();

      // The original name should still be displayed
      await expect(nameCell).toContainText(originalName || '');
    });

    test('should not navigate to project detail when in edit mode', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the first project row
      const firstRow = page.locator('table tbody tr').first();
      const nameCell = firstRow.locator('td').first();

      // Enter edit mode
      await nameCell.hover();
      const editButton = nameCell.locator('button[aria-label="Edit project name"]');
      await editButton.click();

      // Verify we're still on the projects list page
      await expect(page).toHaveURL(/\/teams\/.*\/projects$/);

      // Click somewhere on the row (not in the input)
      await nameCell.locator('span').first().click();

      // Should still be on the projects list page
      await expect(page).toHaveURL(/\/teams\/.*\/projects$/);

      // Press Escape to exit edit mode
      const input = nameCell.locator('input');
      await input.press('Escape');
    });
  });

  test.describe('Resizable Columns', () => {
    test('should show resize cursor on column border hover', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the Name column header resize handle
      const nameHeader = page.locator('table thead th').first();
      const resizeHandle = nameHeader.locator('div[aria-hidden="true"]');

      // Verify the resize handle exists
      await expect(resizeHandle).toBeVisible();

      // Verify it has cursor: col-resize
      await expect(resizeHandle).toHaveCSS('cursor', 'col-resize');
    });

    test('should resize column when dragging the resize handle', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the Name column header
      const nameHeader = page.locator('table thead th').first();
      const resizeHandle = nameHeader.locator('div[aria-hidden="true"]');

      // Get initial column width
      const initialBounds = await nameHeader.boundingBox();
      const initialWidth = initialBounds?.width || 0;

      // Drag the resize handle to the right (increase width by 100px)
      await resizeHandle.hover();
      await page.mouse.down();
      await page.mouse.move(
        (initialBounds?.x || 0) + initialWidth + 100,
        (initialBounds?.y || 0) + 10
      );
      await page.mouse.up();

      // Wait a moment for state to update
      await page.waitForTimeout(100);

      // Get new column width
      const newBounds = await nameHeader.boundingBox();
      const newWidth = newBounds?.width || 0;

      // The column should be wider (with some tolerance for rounding)
      expect(newWidth).toBeGreaterThan(initialWidth + 50);
    });

    test('should enforce minimum column width when dragging left', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the Name column header (first column)
      const nameHeader = page.locator('table thead th').first();
      const resizeHandle = nameHeader.locator('div[aria-hidden="true"]');

      // Get initial column width
      const initialBounds = await nameHeader.boundingBox();

      // Try to drag the resize handle far to the left (to shrink below minimum)
      await resizeHandle.hover();
      await page.mouse.down();
      await page.mouse.move(
        (initialBounds?.x || 0) - 100, // Drag far left
        (initialBounds?.y || 0) + 10
      );
      await page.mouse.up();

      // Wait a moment for state to update
      await page.waitForTimeout(100);

      // Get new column width
      const newBounds = await nameHeader.boundingBox();
      const newWidth = newBounds?.width || 0;

      // The column should not go below minimum (150px for name column)
      expect(newWidth).toBeGreaterThanOrEqual(150);
    });

    test('should have resize handles on all column headers', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get all column headers
      const headers = page.locator('table thead th');
      const count = await headers.count();

      // Verify each header has a resize handle
      for (let i = 0; i < count; i++) {
        const header = headers.nth(i);
        const resizeHandle = header.locator('div[aria-hidden="true"]');
        await expect(resizeHandle).toBeVisible();
      }
    });

    test('should not affect other columns when resizing one column', async ({ page }) => {
      // Check if authenticated (table visible)
      const table = page.locator('table');
      if (!(await table.isVisible())) {
        test.skip(true, 'Skipping - authentication required');
        return;
      }

      // Get the Health column header (second column)
      const healthHeader = page.locator('table thead th').nth(1);
      const priorityHeader = page.locator('table thead th').nth(2);
      const resizeHandle = healthHeader.locator('div[aria-hidden="true"]');

      // Get initial widths of Health and Priority columns
      const initialHealthBounds = await healthHeader.boundingBox();
      const initialPriorityBounds = await priorityHeader.boundingBox();

      // Drag the Health column resize handle to the right
      await resizeHandle.hover();
      await page.mouse.down();
      await page.mouse.move(
        (initialHealthBounds?.x || 0) + (initialHealthBounds?.width || 0) + 50,
        (initialHealthBounds?.y || 0) + 10
      );
      await page.mouse.up();

      // Wait a moment for state to update
      await page.waitForTimeout(100);

      // Get new Priority column width
      const newPriorityBounds = await priorityHeader.boundingBox();

      // Priority column width should be the same (with small tolerance for rendering)
      expect(Math.abs((newPriorityBounds?.width || 0) - (initialPriorityBounds?.width || 0))).toBeLessThan(5);
    });
  });
});
