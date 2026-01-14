import { test, expect } from '@playwright/test';

test.describe('IKA-105: Table Column Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Team Projects page
    await page.goto('/teams/IKA/projects');
    // Wait for either the projects table or auth redirect
    await page.waitForTimeout(3000);
  });

  test('should display visible column borders in table header', async ({ page }) => {
    // Check if authenticated (table visible)
    const table = page.locator('table');
    if (!(await table.isVisible())) {
      test.skip(true, 'Skipping - authentication required');
      return;
    }

    // Check that the table header row exists
    const headerRow = page.locator('thead tr');
    await expect(headerRow).toBeVisible();

    // Check that resizable header cells have the resize divider
    const headerCells = page.locator('thead th');
    const cellCount = await headerCells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Verify the resize divider element exists in header cells
    // The divider has class 'bg-border' which makes it visible
    const resizeDividers = page.locator('thead th > div[aria-hidden="true"]');
    const dividerCount = await resizeDividers.count();
    expect(dividerCount).toBeGreaterThan(0);
  });

  test('should display visible column borders in table body cells', async ({ page }) => {
    // Check if authenticated (table visible)
    const table = page.locator('table');
    if (!(await table.isVisible())) {
      test.skip(true, 'Skipping - authentication required');
      return;
    }

    // Wait for at least one data row to appear
    const dataRows = page.locator('tbody tr');
    const rowCount = await dataRows.count();

    // Skip test if no projects exist
    if (rowCount === 0) {
      test.skip(true, 'Skipping - no projects in table');
      return;
    }

    // Check that the first row has cells with border-r class (except last cell)
    const firstRow = dataRows.first();
    const cellsWithBorder = firstRow.locator('td.border-r');
    const borderedCellCount = await cellsWithBorder.count();

    // Should have 5 bordered cells (Name, Health, Priority, Lead, Target Date)
    // Status column (last) should not have right border
    expect(borderedCellCount).toBe(5);
  });

  test('should maintain column resize functionality', async ({ page }) => {
    // Check if authenticated (table visible)
    const table = page.locator('table');
    if (!(await table.isVisible())) {
      test.skip(true, 'Skipping - authentication required');
      return;
    }

    // Find the first resize divider
    const resizeDivider = page.locator('thead th > div[aria-hidden="true"]').first();
    await expect(resizeDivider).toBeVisible();

    // Get the parent header cell
    const headerCell = page.locator('thead th').first();
    const initialWidth = await headerCell.evaluate((el) => el.offsetWidth);

    // Perform drag operation to resize
    const box = await resizeDivider.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 50, box.y + box.height / 2);
      await page.mouse.up();

      // Verify the column width changed
      const newWidth = await headerCell.evaluate((el) => el.offsetWidth);
      expect(newWidth).toBeGreaterThan(initialWidth);
    }
  });

  test('should show correct cursor on resize divider hover', async ({ page }) => {
    // Check if authenticated (table visible)
    const table = page.locator('table');
    if (!(await table.isVisible())) {
      test.skip(true, 'Skipping - authentication required');
      return;
    }

    // Get the first resize divider
    const resizeDivider = page.locator('thead th > div[aria-hidden="true"]').first();
    await expect(resizeDivider).toBeVisible();

    // Hover over the divider
    await resizeDivider.hover();

    // The hover state applies cursor: col-resize
    const cursor = await resizeDivider.evaluate((el) =>
      window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe('col-resize');
  });
});
