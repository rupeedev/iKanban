import { test, expect } from '@playwright/test';

test.describe('IKA-84: Task Attempts URL Slug Resolution', () => {
  // This test verifies that task attempts API is called with UUID, not URL slug
  // Bug: useTaskAttempts was receiving URL slug instead of task UUID, causing 400 errors
  // Note: Tests require frontend to be running on localhost:3000

  test.beforeEach(async ({ page }) => {
    // Check if the server is running
    try {
      const response = await page.goto('/', { timeout: 5000 });
      if (!response) {
        test.skip(true, 'Frontend server not running');
      }
    } catch {
      test.skip(true, 'Frontend server not running on localhost:3000');
    }
  });

  test.describe('Task Attempts API Calls', () => {
    test('Should not make API calls with slug-formatted task_id', async ({ page }) => {
      // Track API calls that use slug format (contain dashes but aren't UUIDs)
      const slugApiCalls: string[] = [];
      const apiErrors: { url: string; status: number }[] = [];

      // UUID pattern: 8-4-4-4-12 hex characters
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/task-attempts?task_id=')) {
          // Extract the task_id from the URL
          const match = url.match(/task_id=([^&]+)/);
          if (match) {
            const taskId = decodeURIComponent(match[1]);
            // If it contains dashes but isn't a valid UUID, it's a slug
            if (taskId.includes('-') && !uuidPattern.test(taskId)) {
              slugApiCalls.push(url);
            }
          }
        }
      });

      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('/api/task-attempts') && response.status() >= 400) {
          apiErrors.push({ url, status: response.status() });
        }
      });

      // Wait for app to be fully loaded
      await page.waitForLoadState('networkidle');

      // Check if the app has loaded properly
      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'App not loaded properly');
        return;
      }

      // Try to find a project to navigate to
      const projectLink = page.locator('a[href*="/projects/"]').first();
      const hasProjectLink = await projectLink.isVisible().catch(() => false);

      if (!hasProjectLink) {
        test.skip(true, 'No projects available - need authenticated user with projects');
        return;
      }

      // Navigate to a project
      await projectLink.click();
      await page.waitForLoadState('networkidle');

      // Wait for any task navigation
      await page.waitForTimeout(2000);

      // Verify no slug-based API calls were made
      expect(
        slugApiCalls,
        `Expected no API calls with slug task_id, but found: ${slugApiCalls.join(', ')}`
      ).toHaveLength(0);

      // Verify no 400 errors from task-attempts endpoint
      const taskAttemptErrors = apiErrors.filter(e => e.url.includes('/api/task-attempts'));
      expect(
        taskAttemptErrors,
        `Expected no 400 errors from task-attempts, but found: ${JSON.stringify(taskAttemptErrors)}`
      ).toHaveLength(0);
    });

    test('Should use UUID format in task-attempts API calls', async ({ page }) => {
      // Track all task-attempts API calls
      const taskAttemptCalls: { url: string; taskId: string }[] = [];

      // UUID pattern: 8-4-4-4-12 hex characters
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/task-attempts?task_id=')) {
          const match = url.match(/task_id=([^&]+)/);
          if (match) {
            const taskId = decodeURIComponent(match[1]);
            taskAttemptCalls.push({ url, taskId });
          }
        }
      });

      // Wait for app to be fully loaded
      await page.waitForLoadState('networkidle');

      // Check if the app has loaded properly
      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'App not loaded properly');
        return;
      }

      // Try to find and click on a task card to trigger attempt loading
      const taskCard = page.locator('[data-testid="task-card"]').first();
      const hasTaskCard = await taskCard.isVisible().catch(() => false);

      if (!hasTaskCard) {
        // Try alternative: navigate to project tasks
        const projectLink = page.locator('a[href*="/projects/"]').first();
        const hasProjectLink = await projectLink.isVisible().catch(() => false);

        if (!hasProjectLink) {
          test.skip(true, 'No tasks or projects available');
          return;
        }

        await projectLink.click();
        await page.waitForLoadState('networkidle');

        // Look for task card in the kanban board
        const projectTaskCard = page.locator('[data-testid="task-card"]').first();
        const hasProjectTaskCard = await projectTaskCard.isVisible().catch(() => false);

        if (!hasProjectTaskCard) {
          test.skip(true, 'No tasks available in project');
          return;
        }

        await projectTaskCard.click();
      } else {
        await taskCard.click();
      }

      // Wait for API calls to complete
      await page.waitForTimeout(3000);

      // If any task-attempts calls were made, verify they use UUID format
      if (taskAttemptCalls.length > 0) {
        for (const call of taskAttemptCalls) {
          expect(
            uuidPattern.test(call.taskId),
            `Expected task_id to be UUID format, but got: ${call.taskId}`
          ).toBe(true);
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('Should not show 400 errors in console when viewing task', async ({ page }) => {
      // Collect console errors
      const consoleErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (text.includes('400') || text.includes('Bad Request')) {
            consoleErrors.push(text);
          }
        }
      });

      // Wait for app to be fully loaded
      await page.waitForLoadState('networkidle');

      // Check if the app has loaded properly
      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'App not loaded properly');
        return;
      }

      // Navigate to a project if available
      const projectLink = page.locator('a[href*="/projects/"]').first();
      const hasProjectLink = await projectLink.isVisible().catch(() => false);

      if (hasProjectLink) {
        await projectLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }

      // Verify no 400 errors in console related to task-attempts
      const taskAttemptErrors = consoleErrors.filter(e =>
        e.includes('task-attempts') || e.includes('task_id')
      );
      expect(
        taskAttemptErrors,
        `Console should not have 400 errors for task-attempts: ${taskAttemptErrors.join(', ')}`
      ).toHaveLength(0);
    });
  });
});
