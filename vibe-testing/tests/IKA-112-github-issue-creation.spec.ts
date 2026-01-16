import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-112: GitHub Issue Creation for @claude-code Mentions
 *
 * Tests cover:
 * - GitHub issue creation when @claude-code or @copilot is mentioned
 * - Error handling when GitHub connection is missing
 * - Error handling when no repository is linked
 * - Assignment status updates after issue creation
 *
 * Note: Tests require authentication, GitHub connection, and linked repository.
 */

test.describe('IKA-112: GitHub Issue Creation for @claude-code Mentions', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('GitHub Issue Creation Flow', () => {
    test('should create GitHub issue when @claude-code is mentioned', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      // Navigate to task panel
      await page.goto('/teams/IKA/issues');

      // Open a task
      await page.click('[data-testid="task-item"]');

      // Find inline prompt input
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await expect(promptInput).toBeVisible();

      // Type prompt with @claude-code mention
      await promptInput.fill('@claude-code Implement the login feature');

      // Submit the prompt
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show creating toast
      const creatingToast = page.locator('text=/Creating GitHub issue/i');
      await expect(creatingToast).toBeVisible();

      // Should eventually show success toast
      const successToast = page.locator('text=/GitHub issue created/i');
      await expect(successToast).toBeVisible({ timeout: 10000 });
    });

    test('should create GitHub issue when @copilot is mentioned', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Fix the authentication bug');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show success after issue creation
      const successToast = page.locator('text=/GitHub issue created/i');
      await expect(successToast).toBeVisible({ timeout: 10000 });
    });

    test('should update assignment with issue URL after creation', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@claude-code Add unit tests');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for issue creation
      await page.waitForResponse(response =>
        response.url().includes('/copilot') && response.status() === 200
      );

      // Assignment card should show GitHub issue link
      const issueLink = page.locator('a[href*="github.com"][href*="/issues/"]');
      await expect(issueLink).toBeVisible({ timeout: 10000 });
    });

    test('should show assignment status as issue_created', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Refactor the data layer');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for assignment update
      await page.waitForTimeout(2000);

      // Verify status badge shows "Issue Created"
      const statusBadge = page.locator('text=/issue.created|Issue Created/i');
      await expect(statusBadge).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Error Handling', () => {
    test('should show error when no GitHub connection configured', async ({ page }) => {
      test.skip(true, 'Requires authenticated session WITHOUT GitHub connection');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@claude-code Implement feature');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show error toast about missing GitHub connection
      const errorToast = page.locator('text=/No GitHub connection/i');
      await expect(errorToast).toBeVisible();
    });

    test('should show error when no repository linked', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection but no linked repo');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Implement feature');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should show error toast about missing repository
      const errorToast = page.locator('text=/No repository linked/i');
      await expect(errorToast).toBeVisible();
    });

    test('should handle GitHub API errors gracefully', async ({ page }) => {
      test.skip(true, 'Requires mock GitHub API that returns errors');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@claude-code Implement feature');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for API response
      await page.waitForTimeout(3000);

      // Should show failed status
      const failedStatus = page.locator('text=/failed/i');
      await expect(failedStatus).toBeVisible();
    });

    test('should show error message in assignment when creation fails', async ({ page }) => {
      test.skip(true, 'Requires mock GitHub API that returns errors');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@copilot Implement feature');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for API response
      await page.waitForTimeout(3000);

      // Should display error message from GitHub API
      const errorMessage = page.locator('[data-testid="assignment-error"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(/error|failed/i);
    });
  });

  test.describe('Issue Content Verification', () => {
    test('should include task title in issue title', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      // This would verify that the created issue has the format:
      // "[Copilot] Task: {task_title}"
      // Verification would typically be done by checking the GitHub issue
      // via API or by checking the assignment response contains expected data
    });

    test('should include task description in issue body', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      // Verify issue body contains:
      // - Task title
      // - Task description
      // - Copilot instructions (the prompt)
      // - iKanban attribution footer
    });

    test('should add copilot and automated labels to issue', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      // Verify the created issue has labels:
      // - "copilot"
      // - "automated"
    });
  });

  test.describe('Assignment Updates', () => {
    test('should store github_issue_id in assignment', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      // After issue creation, assignment should have:
      // - github_issue_id (number from GitHub)
      // - github_issue_url (full URL to issue)
      // - github_repo_owner
      // - github_repo_name
      // - status: "issue_created"
    });

    test('should transition status from pending to issue_created', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with GitHub connection');

      await page.goto('/teams/IKA/issues');
      await page.click('[data-testid="task-item"]');

      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@claude-code Test task');

      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Should initially show "pending"
      const pendingStatus = page.locator('text=/pending/i');
      await expect(pendingStatus).toBeVisible();

      // Should eventually transition to "issue_created"
      const createdStatus = page.locator('text=/issue.created|Issue Created/i');
      await expect(createdStatus).toBeVisible({ timeout: 10000 });
    });
  });
});
