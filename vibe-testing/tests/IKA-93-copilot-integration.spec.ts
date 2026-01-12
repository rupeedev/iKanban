import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-93: GitHub Copilot Integration
 *
 * These tests cover:
 * - @copilot mention in task comments
 * - Copilot assignment creation
 * - Integration with GitHub (issue creation, PR tracking)
 *
 * Note: Tests require authentication, GitHub connection, and a valid project/task context.
 */

test.describe('IKA-93: GitHub Copilot Integration', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('@copilot Mention in Agent Suggestions', () => {
    test('should show @copilot in agent suggestions dropdown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      await page.goto('/teams/IKA/issues');
      // Click on a task to open details
      // Type @ to trigger suggestions

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@');

      const suggestions = page.locator('[role="listbox"]');
      await expect(suggestions).toBeVisible();

      // @copilot should be in the list
      const copilotOption = suggestions.locator('text=GitHub Copilot');
      await expect(copilotOption).toBeVisible();
    });

    test('should filter to show @copilot when typing @cop', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@cop');

      const suggestions = page.locator('[role="listbox"]');
      await expect(suggestions).toBeVisible();

      // Should show copilot in filtered results
      const copilotOption = suggestions.locator('text=copilot', { exact: false });
      await expect(copilotOption).toBeVisible();
    });

    test('should insert @copilot mention when selected', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@cop');

      // Select with Enter key
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // Verify @copilot was inserted
      await expect(promptInput).toHaveValue(/@copilot/i);
    });
  });

  test.describe('Copilot Assignment Submission', () => {
    test('should show agent indicator for @copilot', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Fix the login bug');

      // Agent indicator should show GitHub Copilot
      const agentIndicator = page.locator('text=GitHub Copilot');
      await expect(agentIndicator).toBeVisible();
    });

    test('should create copilot assignment on submit', async ({ page }) => {
      test.skip(true, 'Requires authenticated session, project setup, and GitHub connection');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Implement the user authentication feature');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show success toast
      const successToast = page.locator('text=Task assigned to Copilot');
      await expect(successToast).toBeVisible();

      // Comment should be created
      const comment = page.locator(
        'text=@copilot Implement the user authentication feature'
      );
      await expect(comment).toBeVisible();
    });

    test('should show error when GitHub is not connected', async ({ page }) => {
      test.skip(true, 'Requires authenticated session without GitHub connection');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Test prompt');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show error toast about GitHub connection
      const errorToast = page.locator('text=No GitHub connection configured');
      await expect(errorToast).toBeVisible();
    });

    test('should disable submit button while assigning', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Test prompt');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Button should be disabled during assignment
      await expect(submitButton).toBeDisabled();

      // Loading spinner should be visible
      const spinner = submitButton.locator('svg.animate-spin');
      await expect(spinner).toBeVisible();
    });
  });

  test.describe('Copilot Status Display', () => {
    test('should show copilot assignment status in task panel', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with existing copilot assignment'
      );

      // Navigate to task with existing copilot assignment
      await page.goto('/teams/IKA/issues');
      // Click on task with copilot assignment

      // Should display assignment status
      const statusBadge = page.locator(
        '[data-testid="copilot-status"]'
      );
      await expect(statusBadge).toBeVisible();
    });

    test('should show pending status initially', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with pending copilot assignment'
      );

      const statusBadge = page.locator('[data-testid="copilot-status"]');
      await expect(statusBadge).toContainText('pending');
    });

    test('should show PR created status with link', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with pr_created copilot assignment'
      );

      const prLink = page.locator('[data-testid="copilot-pr-link"]');
      await expect(prLink).toBeVisible();
      await expect(prLink).toHaveAttribute('href', /github\.com.*pull/);
    });

    test('should show CI status', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with ci_pending/ci_passed/ci_failed assignment'
      );

      const ciStatus = page.locator('[data-testid="copilot-ci-status"]');
      await expect(ciStatus).toBeVisible();
      await expect(ciStatus).toContainText(/pending|passed|failed/i);
    });

    test('should show deployed status with URL', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with deployed copilot assignment'
      );

      const deploymentUrl = page.locator('[data-testid="copilot-deployment-url"]');
      await expect(deploymentUrl).toBeVisible();
      await expect(deploymentUrl).toHaveAttribute('href', /https?:\/\//);
    });
  });

  test.describe('Copilot vs Other Agents', () => {
    test('@copilot should not create local workspace', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Test prompt');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should NOT navigate to attempts page (unlike @claude, @gemini)
      await expect(page).not.toHaveURL(/\/attempts\//);

      // Should stay on the current task page
      await expect(page).toHaveURL(/\/issues\//);
    });

    test('@claude should create local workspace (different from @copilot)', async ({
      page,
    }) => {
      test.skip(true, 'Requires authenticated session with executor profiles');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@claude Test prompt');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should navigate to attempts page (local workspace creation)
      await expect(page).toHaveURL(/\/attempts\//);
    });
  });

  test.describe('API Integration', () => {
    test('should call POST /api/tasks/{taskId}/copilot on @copilot submit', async ({
      page,
    }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Intercept the API call
      const apiPromise = page.waitForRequest(
        (request) =>
          request.url().includes('/api/tasks/') &&
          request.url().includes('/copilot') &&
          request.method() === 'POST'
      );

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Implement feature X');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      const request = await apiPromise;
      const requestBody = request.postDataJSON();

      expect(requestBody).toHaveProperty('prompt', 'Implement feature X');
    });

    test('should receive copilot assignment in response', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Intercept the API response
      const apiPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/tasks/') &&
          response.url().includes('/copilot') &&
          response.request().method() === 'POST'
      );

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Test');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      const response = await apiPromise;
      const responseBody = await response.json();

      expect(responseBody.data).toHaveProperty('id');
      expect(responseBody.data).toHaveProperty('status', 'pending');
      expect(responseBody.data).toHaveProperty('prompt');
    });
  });

  test.describe('Comment with @copilot', () => {
    test('should create comment before copilot assignment', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Intercept comment API
      const commentPromise = page.waitForRequest(
        (request) =>
          request.url().includes('/api/tasks/') &&
          request.url().includes('/comments') &&
          request.method() === 'POST'
      );

      // Intercept copilot API
      const copilotPromise = page.waitForRequest(
        (request) =>
          request.url().includes('/api/tasks/') &&
          request.url().includes('/copilot') &&
          request.method() === 'POST'
      );

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Fix the bug in auth module');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Comment should be created first
      const commentRequest = await commentPromise;
      const commentBody = commentRequest.postDataJSON();
      expect(commentBody.content).toBe('@copilot Fix the bug in auth module');

      // Then copilot assignment should be created
      const copilotRequest = await copilotPromise;
      const copilotBody = copilotRequest.postDataJSON();
      expect(copilotBody.prompt).toBe('Fix the bug in auth module');
    });
  });
});
