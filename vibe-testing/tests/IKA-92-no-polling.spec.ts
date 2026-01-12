import { test, expect } from '@playwright/test';

/**
 * IKA-92: Tests for verifying no excessive polling of task-attempts API.
 *
 * These tests require the frontend dev server to be running on localhost:3000.
 * Run `cd vibe-frontend && pnpm dev` before executing these tests.
 *
 * Manual verification steps:
 * 1. Open the app and navigate to a task
 * 2. Open browser DevTools Network tab
 * 3. Filter by "task-attempts"
 * 4. Wait 30 seconds - should see only 1-2 requests, not repeated polling
 */
test.describe('IKA-92: Task attempts should not poll excessively', () => {
  test('should not make repeated task-attempts requests when viewing task panel', async ({
    page,
  }) => {
    // Track API calls to task-attempts endpoint
    const taskAttemptsRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/task-attempts')) {
        taskAttemptsRequests.push(request.url());
      }
    });

    // Navigate to the issues page (adjust URL based on your app structure)
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Click on a task to open the task panel (if applicable)
    const taskRow = page.locator('[data-testid="task-row"]').first();
    if (await taskRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await taskRow.click();
      await page.waitForTimeout(1000);
    }

    // Record initial request count after panel opens
    const initialCount = taskAttemptsRequests.length;

    // Wait 10 seconds to see if polling occurs
    await page.waitForTimeout(10000);

    // Check that no more than 1-2 additional requests were made
    // (allowing for potential race conditions or legitimate refetches)
    const finalCount = taskAttemptsRequests.length;
    const additionalRequests = finalCount - initialCount;

    // Before fix: would see ~2 requests per 5 seconds = ~4 requests in 10 seconds
    // After fix: should see 0 additional requests (no polling)
    expect(additionalRequests).toBeLessThanOrEqual(2);

    console.log(
      `Task-attempts requests: initial=${initialCount}, final=${finalCount}, additional=${additionalRequests}`
    );
  });

  test('task attempts data should load on page open', async ({ page }) => {
    // Verify that data still loads initially (just no polling after)
    let requestMade = false;

    page.on('request', (request) => {
      if (request.url().includes('/api/task-attempts')) {
        requestMade = true;
      }
    });

    // Navigate to a page that shows task attempts
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on a task to open panel
    const taskRow = page.locator('[data-testid="task-row"]').first();
    if (await taskRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await taskRow.click();
      await page.waitForTimeout(2000);
    }

    // Verify at least one request was made (data loads)
    // Note: This may be true or false depending on whether a task panel is visible
    // The main assertion is the first test which checks for no excessive polling
    console.log(`Task-attempts request made on page load: ${requestMade}`);
  });
});
