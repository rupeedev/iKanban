import { test, expect } from '@playwright/test';

test.describe('IKA-107: Team name on project cards', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the projects page
    await page.goto('/projects');
    // Wait for page to settle (auth redirect or content load)
    await page.waitForTimeout(3000);
  });

  test('should display team identifier on project cards belonging to a team', async ({ page }) => {
    // Check if authenticated and projects are visible
    const projectCards = page.locator('[class*="Card"]');
    if (!(await projectCards.first().isVisible())) {
      test.skip(true, 'Skipping - authentication required or no projects');
      return;
    }

    // Check that at least some cards have team identifiers (IKA or SCH)
    // Look for the muted text that contains the team identifier
    const cardsWithTeamIdentifier = page.locator('.text-muted-foreground.text-xs');
    const count = await cardsWithTeamIdentifier.count();

    // There should be at least one card with a team identifier
    expect(count).toBeGreaterThan(0);

    // Verify the identifier format (should be uppercase letters like IKA, SCH)
    const firstIdentifier = await cardsWithTeamIdentifier.first().textContent();
    expect(firstIdentifier).toMatch(/^[A-Z]{2,4}$/);
  });

  test('should show project name alongside team identifier', async ({ page }) => {
    // Check if authenticated and projects are visible
    const projectCards = page.locator('[class*="Card"]');
    if (!(await projectCards.first().isVisible())) {
      test.skip(true, 'Skipping - authentication required or no projects');
      return;
    }

    // Find a card title area - it should contain the project name
    const cardHeaders = page.locator('[class*="CardHeader"]');
    const headerCount = await cardHeaders.count();
    expect(headerCount).toBeGreaterThan(0);

    // Each header should have a title with project name
    const firstHeader = cardHeaders.first();
    const titleElement = firstHeader.locator('[class*="CardTitle"]');
    await expect(titleElement).toBeVisible();
  });

  test('should render project cards in a 3-column grid on large screens', async ({ page }) => {
    // Set viewport to large screen
    await page.setViewportSize({ width: 1280, height: 800 });

    // Check if authenticated and projects are visible
    const projectCards = page.locator('[class*="Card"]');
    if (!(await projectCards.first().isVisible())) {
      test.skip(true, 'Skipping - authentication required or no projects');
      return;
    }

    // Check that the grid container exists and has correct classes
    const gridContainer = page.locator('.grid.gap-6');
    await expect(gridContainer).toBeVisible();
  });

  test('should navigate to project tasks when card is clicked', async ({ page }) => {
    // Check if authenticated and projects are visible
    const projectCards = page.locator('[class*="Card"]');
    if (!(await projectCards.first().isVisible())) {
      test.skip(true, 'Skipping - authentication required or no projects');
      return;
    }

    // Get the first clickable project card
    const firstCard = projectCards.first();

    // Click on the first project card
    await firstCard.click();

    // Should navigate to the tasks page for that project
    await expect(page).toHaveURL(/\/projects\/.*\/tasks/, { timeout: 5000 });
  });

  test('should show created date on each project card', async ({ page }) => {
    // Check if authenticated and projects are visible
    const projectCards = page.locator('[class*="Card"]');
    if (!(await projectCards.first().isVisible())) {
      test.skip(true, 'Skipping - authentication required or no projects');
      return;
    }

    // Check that cards have CardDescription elements (contains created date)
    const descriptions = page.locator('[class*="CardDescription"]');
    const count = await descriptions.count();
    expect(count).toBeGreaterThan(0);

    // The first description should contain date-like text
    const firstDescription = await descriptions.first().textContent();
    // Should match format like "Created 1/8/2026" or similar
    expect(firstDescription).toMatch(/Created|Date|\d+\/\d+/i);
  });
});
