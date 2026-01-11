import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-69: Fix Inline Prompt Send Button Not Responding
 *
 * Root cause: InlinePromptInput component was parsing the prompt correctly
 * but never passing it to the backend. The cleanPrompt variable was ignored.
 *
 * Fix: Updated useAttemptCreation hook to:
 * 1. Accept a `prompt` parameter
 * 2. After creating workspace, create a session
 * 3. Call sessionsApi.followUp() with the prompt to start AI execution
 *
 * Note: Tests require authentication to access task panel.
 */

test.describe('IKA-69: Fix Inline Prompt Send Button', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Button Interaction', () => {
    test('send button should be clickable when prompt has content', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to a task with inline prompt
      await page.goto('/teams/IKA/issues');

      // Click on a task to open details
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill in the prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex what is the capital of Brazil');

      // Submit button should be enabled
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await expect(submitButton).toBeEnabled();

      // Click should trigger submission (not do nothing)
      await submitButton.click();

      // Should either navigate to attempt or show loading state
      const isLoading = await page.locator('svg.animate-spin').isVisible().catch(() => false);
      const hasNavigated = page.url().includes('/attempts/');

      expect(isLoading || hasNavigated).toBeTruthy();
    });

    test('Cmd+Enter should submit the prompt', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to a task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex test prompt');

      // Press Cmd+Enter
      await page.keyboard.press('Meta+Enter');

      // Should show loading or navigate
      await page.waitForTimeout(500);
      const isLoading = await page.locator('svg.animate-spin').isVisible().catch(() => false);
      const hasNavigated = page.url().includes('/attempts/');

      expect(isLoading || hasNavigated).toBeTruthy();
    });
  });

  test.describe('Prompt Submission Flow', () => {
    test('should create attempt AND start execution with prompt', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex analyze this code');

      // Submit
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for navigation to attempt page
      await page.waitForURL(/\/attempts\//, { timeout: 10000 });

      // The attempt page should show the execution starting
      // (logs should appear, not just empty attempt view)
      const logsPanel = page.locator('[data-testid="logs-panel"]');
      await expect(logsPanel).toBeVisible({ timeout: 5000 });
    });

    test('should pass prompt to AI agent (not just create empty attempt)', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and API keys configured');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt with specific text we can verify
      const testPrompt = 'What is 2 + 2?';
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill(`@codex ${testPrompt}`);

      // Submit
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for attempt page
      await page.waitForURL(/\/attempts\//, { timeout: 10000 });

      // The logs should contain evidence that the prompt was received
      // This could be the prompt echoed, or AI response starting
      const logsContent = page.locator('[data-testid="logs-content"]');
      await expect(logsContent).toContainText(/2\s*\+\s*2|four|4/, { timeout: 30000 });
    });
  });

  test.describe('Loading States', () => {
    test('should show loading spinner during submission', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex test');

      // Click submit
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Loading spinner should appear (even briefly)
      const spinner = submitButton.locator('svg.animate-spin');
      await expect(spinner).toBeVisible({ timeout: 1000 });
    });

    test('should disable input during submission', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex test');

      // Click submit
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Input should be disabled during submission
      await expect(promptInput).toBeDisabled({ timeout: 1000 });
    });

    test('should clear input after successful submission', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and project setup');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex test prompt');

      // Submit
      const submitButton = page.locator('[data-testid="inline-prompt-submit"]');
      await submitButton.click();

      // Wait for submission to complete (either navigation or loading ends)
      await page.waitForTimeout(2000);

      // If still on page, input should be cleared
      if (!page.url().includes('/attempts/')) {
        await expect(promptInput).toHaveValue('');
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should show error message on submission failure', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and mock error condition');

      // This would test error handling when the API fails
      // Would need to mock the API to return an error
    });
  });

  test.describe('Agent Selection', () => {
    test('should use selected agent from @mention', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and multiple agents configured');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt with @codex mention
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('@codex explain this function');

      // Verify agent indicator shows Codex
      const agentIndicator = page.locator('text=/CODEX/i');
      await expect(agentIndicator).toBeVisible();
    });

    test('should use default agent when no @mention provided', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      // Navigate to task
      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Fill prompt without @mention
      const promptInput = page.locator('[data-testid="inline-prompt-input"]');
      await promptInput.fill('explain this function');

      // Verify default agent indicator is shown
      const defaultIndicator = page.locator('text=/\\(default\\)/i');
      await expect(defaultIndicator).toBeVisible();
    });
  });
});
