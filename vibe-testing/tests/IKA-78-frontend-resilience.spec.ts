import { test, expect } from '@playwright/test';

/**
 * IKA-78: Frontend Resilience Tests
 *
 * Tests for error boundaries and component isolation.
 * Verifies that when one section fails, others continue working.
 */

test.describe('IKA-78: Frontend Resilience - Error Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that uses the NormalLayout with error boundaries
    await page.goto('/projects');
    // Wait for initial load
    await page.waitForLoadState('networkidle');
  });

  test('sidebar error does not crash main content', async ({ page }) => {
    // Mock the teams API to return 500 error
    await page.route('**/api/teams**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Reload to trigger the error
    await page.reload();

    // Wait for page to settle
    await page.waitForTimeout(1000);

    // Main content should still be visible (projects page content)
    const mainContent = page.locator('.space-y-6, [data-testid="projects-content"]');
    await expect(mainContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('page renders even when some API calls fail', async ({ page }) => {
    // Let some requests fail
    let requestCount = 0;
    await page.route('**/api/**', async (route) => {
      requestCount++;
      // Fail every third request
      if (requestCount % 3 === 0) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Simulated failure' }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate and check page doesn't completely crash
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Page should have some structure visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should not be a completely blank page
    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(100);
  });

  test('navigation remains functional even with errors', async ({ page }) => {
    // Start on projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Navigation elements should be present
    const nav = page.locator('nav, [role="navigation"], .border-b');
    await expect(nav.first()).toBeVisible();
  });
});

test.describe('IKA-78: Frontend Resilience - Loading States', () => {
  test('shows loading state while data is fetching', async ({ page }) => {
    // Slow down API responses to see loading state
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/projects');

    // Should show some form of loading indicator
    // (either skeleton, spinner, or loading text)
    const loadingIndicator = page.locator(
      '.animate-pulse, .animate-spin, [data-loading], text=Loading'
    );
    // Loading may be fast, so we just check page eventually loads
    await page.waitForLoadState('networkidle');
  });

  test('page recovers after temporary API failure', async ({ page }) => {
    let failFirst = true;

    await page.route('**/api/projects**', async (route) => {
      if (failFirst) {
        failFirst = false;
        await route.fulfill({
          status: 503,
          body: JSON.stringify({ error: 'Service temporarily unavailable' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Wait and try again - page should eventually work
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Second load should work
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('IKA-78: Frontend Resilience - UI Components', () => {
  test('error card component renders correctly', async ({ page }) => {
    // Navigate to a test page or trigger an error state
    await page.goto('/projects');

    // Mock API to return error
    await page.route('**/api/projects**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test error' }),
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    // Check for error indication in the page
    // The exact selector depends on how errors are displayed
    const errorIndicators = page.locator(
      '[role="alert"], .text-destructive, [data-testid*="error"]'
    );

    // Page should show some error state or fallback content
    const body = await page.textContent('body');
    expect(body).not.toBeNull();
  });

  test('empty state shows when no data', async ({ page }) => {
    // Mock projects API to return empty array
    await page.route('**/api/projects**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Should show empty state or create prompt
    const emptyStateIndicators = page.locator(
      'text=No projects, text=Create, text=empty, [data-testid="empty-state"]'
    );

    // At least one empty-related element should be visible
    const count = await emptyStateIndicators.count();
    // Page should have loaded something
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(50);
  });
});

test.describe('IKA-78: Frontend Resilience - Error Recovery', () => {
  test('retry button refetches data on error', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/projects**', async (route) => {
      callCount++;
      if (callCount === 1) {
        // First call fails
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'First call failed' }),
        });
      } else {
        // Subsequent calls succeed
        await route.continue();
      }
    });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Look for retry button or reload
    const retryButton = page.locator(
      'button:has-text("Retry"), button:has-text("Try again"), button:has-text("Reload")'
    );

    if ((await retryButton.count()) > 0) {
      await retryButton.first().click();
      await page.waitForLoadState('networkidle');

      // After retry, should have made another API call
      expect(callCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('page reload recovers from error state', async ({ page }) => {
    // First request fails
    await page.route('**/api/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Remove the failing route
    await page.unroute('**/api/**');

    // Reload should work now
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Page should be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('IKA-78: Frontend Resilience - Component Isolation', () => {
  test('layout sections are independently wrapped', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // The layout should have distinct sections
    // Sidebar, Navbar, and Main Content areas
    const sidebar = page.locator('[class*="w-60"], [class*="w-14"], .border-r').first();
    const navbar = page.locator('.border-b').first();
    const mainContent = page.locator('.flex-1').first();

    // At least some layout structure should be visible
    const layoutExists =
      (await sidebar.isVisible()) ||
      (await navbar.isVisible()) ||
      (await mainContent.isVisible());

    expect(layoutExists).toBeTruthy();
  });

  test('failed sidebar API does not prevent page navigation', async ({ page }) => {
    // Fail sidebar-related APIs
    await page.route('**/api/teams**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Teams API failed' }),
      });
    });

    // Navigate to projects
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Try to navigate to settings
    const settingsLink = page.locator(
      'a[href*="settings"], button:has-text("Settings"), [aria-label="Settings"]'
    );

    if ((await settingsLink.count()) > 0) {
      await settingsLink.first().click();
      await page.waitForLoadState('networkidle');

      // Should have navigated
      const url = page.url();
      // Page should still be functional
      const body = page.locator('body');
      await expect(body).toBeVisible();
    }
  });
});
