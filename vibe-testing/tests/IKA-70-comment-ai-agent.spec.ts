import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-70: AI Agent Integration from Task Comments
 *
 * Feature: Users can type @agent mentions in the task comment editor
 * and trigger AI execution when clicking the Comment button.
 *
 * The comment is ALWAYS saved (with original content including @mention),
 * and if a valid @agent mention is detected, AI execution starts and
 * the user is navigated to the attempt page.
 *
 * Note: Tests require authentication to access task comments.
 */

test.describe('IKA-70: AI Agent Integration from Task Comments', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Basic Comment Functionality (Unchanged)', () => {
    test('should save comment without @mention normally', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      // Navigate to task issues
      await page.goto('/teams/IKA/issues');

      // Click on a task to open detail panel
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Wait for comment editor to be visible
      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await expect(commentEditor).toBeVisible();

      // Type a regular comment without @mention
      await commentEditor.fill('This is a regular comment without AI trigger');

      // Click Comment button
      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Comment should appear in the list
      await expect(page.locator('text=This is a regular comment')).toBeVisible();

      // Should NOT navigate to attempt page
      expect(page.url()).not.toContain('/attempts/');
    });

    test('should clear input after successful comment submission', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('Test comment');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Wait for submission
      await page.waitForTimeout(1000);

      // Input should be cleared
      await expect(commentEditor).toHaveValue('');
    });
  });

  test.describe('@Agent Detection in Comments', () => {
    test('should detect @claude mention and trigger AI execution', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and AI keys configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@claude tell me the capital of Japan');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should navigate to attempt page (AI execution started)
      await page.waitForURL(/\/attempts\//, { timeout: 15000 });
      expect(page.url()).toContain('/attempts/');
    });

    test('should detect @codex mention and trigger AI execution', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and OpenAI key configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@codex explain this function');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should navigate to attempt page
      await page.waitForURL(/\/attempts\//, { timeout: 15000 });
    });

    test('should detect @gemini mention and trigger AI execution', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and Gemini key configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@gemini what does this code do?');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      await page.waitForURL(/\/attempts\//, { timeout: 15000 });
    });
  });

  test.describe('Comment is Always Saved', () => {
    test('should save comment with @mention content visible', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      const testComment = '@claude test prompt for AI';
      await commentEditor.fill(testComment);

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Wait a bit for comment to be saved
      await page.waitForTimeout(500);

      // The comment should be saved with the @mention visible
      // (even if we navigate away, the comment persists)
      // Note: We might navigate to attempt page, so check before navigation
      const commentVisible = await page
        .locator(`text=${testComment}`)
        .isVisible()
        .catch(() => false);

      // Either comment is visible or we navigated (both are success cases)
      expect(commentVisible || page.url().includes('/attempts/')).toBeTruthy();
    });
  });

  test.describe('Edge Cases', () => {
    test('should not trigger AI for invalid @mention', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@invalid-agent-name some text');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Wait for submission
      await page.waitForTimeout(1000);

      // Should NOT navigate to attempt page (invalid agent)
      expect(page.url()).not.toContain('/attempts/');

      // Comment should still be saved
      await expect(page.locator('text=@invalid-agent-name')).toBeVisible();
    });

    test('should not trigger AI for @mention with empty prompt', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@claude');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      await page.waitForTimeout(1000);

      // Should NOT navigate (empty prompt after @mention)
      expect(page.url()).not.toContain('/attempts/');
    });

    test('should use first @mention when multiple are present', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and multiple agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      // @codex should be used (first mention)
      await commentEditor.fill('@codex @claude analyze this');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should navigate (uses first valid @mention)
      await page.waitForURL(/\/attempts\//, { timeout: 15000 });
    });
  });

  test.describe('Close Issue with @Agent', () => {
    test('should handle close issue with @mention', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@claude summarize the work done');

      // Click "Close issue" button instead of "Comment"
      const closeButton = page.locator('button:has-text("Close issue")');
      await closeButton.click();

      // Should close issue AND start AI execution
      await page.waitForTimeout(1000);

      // Either navigated to attempt or task status updated
      const hasNavigated = page.url().includes('/attempts/');
      const taskClosed = await page
        .locator('text=Done')
        .isVisible()
        .catch(() => false);

      expect(hasNavigated || taskClosed).toBeTruthy();
    });
  });

  test.describe('Loading States', () => {
    test('should show loading state during comment + AI submission', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      await commentEditor.fill('@claude test');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should show loading state (spinner or disabled button)
      const isLoading = await commentButton.isDisabled().catch(() => false);
      const hasSpinner = await page
        .locator('svg.animate-spin')
        .isVisible()
        .catch(() => false);

      // Either button is disabled or spinner is showing
      expect(isLoading || hasSpinner).toBeTruthy();
    });
  });

  test.describe('Formatting Toolbar Compatibility', () => {
    test('should work with markdown formatting in comment', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea[placeholder*="comment"]');
      // Use markdown formatting alongside @mention
      await commentEditor.fill('@claude **analyze** this `code`');

      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should work with markdown formatting
      await page.waitForTimeout(1000);

      // Comment should be saved (regardless of AI execution)
      const commentSaved =
        (await page.locator('text=analyze').isVisible().catch(() => false)) ||
        page.url().includes('/attempts/');

      expect(commentSaved).toBeTruthy();
    });
  });
});
