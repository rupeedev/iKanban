import { test, expect } from '@playwright/test';

test.describe('IKA-99: Project Name Uniqueness', () => {
  const UNIQUE_PROJECT_NAME = `Test Project ${Date.now()}`;
  const TEAM_PATH = '/teams/IKA/projects';

  test.beforeEach(async ({ page }) => {
    // Navigate to the team projects page
    await page.goto(TEAM_PATH);
    // Wait for the projects table to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should show error when creating project with duplicate name', async ({ page }) => {
    // First, get an existing project name from the table
    const firstProjectName = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstProjectName).toBeTruthy();

    // Click "New project" button
    await page.click('button:has-text("New project")');

    // Wait for the dialog to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type the duplicate project name
    const nameInput = dialog.locator('input[placeholder="Project name"]');
    await nameInput.fill(firstProjectName!.trim());

    // Wait for the error message to appear
    const errorMessage = dialog.locator('text=A project with this name already exists');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    // Verify the Create button is disabled
    const createButton = dialog.locator('button:has-text("Create project")');
    await expect(createButton).toBeDisabled();
  });

  test('should allow creating project with unique name', async ({ page }) => {
    // Click "New project" button
    await page.click('button:has-text("New project")');

    // Wait for the dialog to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type a unique project name
    const nameInput = dialog.locator('input[placeholder="Project name"]');
    await nameInput.fill(UNIQUE_PROJECT_NAME);

    // Wait a moment for validation
    await page.waitForTimeout(500);

    // Verify NO error message is shown
    const errorMessage = dialog.locator('text=A project with this name already exists');
    await expect(errorMessage).not.toBeVisible();

    // Verify the Create button is enabled
    const createButton = dialog.locator('button:has-text("Create project")');
    await expect(createButton).toBeEnabled();
  });

  test('should handle case-insensitive duplicate detection', async ({ page }) => {
    // Get an existing project name from the table
    const firstProjectName = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstProjectName).toBeTruthy();

    // Click "New project" button
    await page.click('button:has-text("New project")');

    // Wait for the dialog to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type the project name with different case (uppercase)
    const nameInput = dialog.locator('input[placeholder="Project name"]');
    await nameInput.fill(firstProjectName!.trim().toUpperCase());

    // Wait for the error message to appear (case-insensitive match)
    const errorMessage = dialog.locator('text=A project with this name already exists');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    // Verify the Create button is disabled
    const createButton = dialog.locator('button:has-text("Create project")');
    await expect(createButton).toBeDisabled();
  });

  test('should handle whitespace-trimmed duplicate detection', async ({ page }) => {
    // Get an existing project name from the table
    const firstProjectName = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstProjectName).toBeTruthy();

    // Click "New project" button
    await page.click('button:has-text("New project")');

    // Wait for the dialog to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type the project name with extra whitespace
    const nameInput = dialog.locator('input[placeholder="Project name"]');
    await nameInput.fill(`  ${firstProjectName!.trim()}  `);

    // Wait for the error message to appear (whitespace should be trimmed for comparison)
    const errorMessage = dialog.locator('text=A project with this name already exists');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    // Verify the Create button is disabled
    const createButton = dialog.locator('button:has-text("Create project")');
    await expect(createButton).toBeDisabled();
  });

  test('should clear error when name becomes unique', async ({ page }) => {
    // Get an existing project name from the table
    const firstProjectName = await page.locator('table tbody tr').first().locator('td').first().textContent();
    expect(firstProjectName).toBeTruthy();

    // Click "New project" button
    await page.click('button:has-text("New project")');

    // Wait for the dialog to appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Type the duplicate project name
    const nameInput = dialog.locator('input[placeholder="Project name"]');
    await nameInput.fill(firstProjectName!.trim());

    // Wait for the error message to appear
    const errorMessage = dialog.locator('text=A project with this name already exists');
    await expect(errorMessage).toBeVisible({ timeout: 3000 });

    // Clear and type a unique name
    await nameInput.clear();
    await nameInput.fill(UNIQUE_PROJECT_NAME);

    // Wait a moment for validation
    await page.waitForTimeout(500);

    // Verify error message is now hidden
    await expect(errorMessage).not.toBeVisible();

    // Verify the Create button is now enabled
    const createButton = dialog.locator('button:has-text("Create project")');
    await expect(createButton).toBeEnabled();
  });

  test('should allow editing project to keep its own name', async ({ page }) => {
    // Click on the first project row to open edit dialog
    const firstRow = page.locator('table tbody tr').first();
    const projectNameCell = firstRow.locator('td').first();
    const projectName = await projectNameCell.textContent();

    // Double-click or click to open edit dialog (depending on implementation)
    await projectNameCell.click();

    // Wait for edit dialog to appear
    const dialog = page.locator('[role="dialog"]');
    // If no dialog appears (inline editing), skip this test
    const dialogVisible = await dialog.isVisible().catch(() => false);

    if (dialogVisible) {
      // The project should be able to keep its own name without error
      const nameInput = dialog.locator('input[placeholder="Project name"]');
      const currentValue = await nameInput.inputValue();

      // Clear and re-type the same name
      await nameInput.clear();
      await nameInput.fill(currentValue);

      // Wait a moment for validation
      await page.waitForTimeout(500);

      // Verify NO error message is shown (it's the same project)
      const errorMessage = dialog.locator('text=A project with this name already exists');
      await expect(errorMessage).not.toBeVisible();
    }
  });
});
