import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-71: Agent Mention Autocomplete in Comment Editor
 *
 * Feature: When users type @ in the comment editor, an autocomplete dropdown
 * appears showing available AI agents. Users can navigate with arrow keys
 * and select an agent to insert the @mention into their comment.
 *
 * Note: Tests require authentication to access task comments.
 */

test.describe('IKA-71: Agent Mention Autocomplete in Comment Editor', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Autocomplete Trigger', () => {
    test('should show autocomplete dropdown when typing @', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      // Navigate to task issues
      await page.goto('/teams/IKA/issues');

      // Click on a task to open detail panel
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      // Wait for comment editor to be visible
      const commentEditor = page.locator('textarea').filter({ hasText: /Add a comment/i }).or(
        page.locator('textarea[placeholder*="comment"]')
      );
      await expect(commentEditor).toBeVisible();

      // Type @ to trigger autocomplete
      await commentEditor.type('@');

      // Autocomplete dropdown should appear
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible({ timeout: 2000 });
    });

    test('should filter suggestions as user types', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@cla');

      // Dropdown should show filtered results (e.g., Claude)
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Should contain Claude-related suggestion
      await expect(dropdown.locator('text=/claude/i')).toBeVisible();
    });

    test('should hide dropdown when @ is followed by space', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@ ');

      // Dropdown should not be visible (space breaks the mention)
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).not.toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate down with ArrowDown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      // Wait for dropdown
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Press ArrowDown to move selection
      await page.keyboard.press('ArrowDown');

      // Second item should be selected (aria-selected="true")
      const secondOption = dropdown.locator('[role="option"]').nth(1);
      await expect(secondOption).toHaveAttribute('aria-selected', 'true');
    });

    test('should navigate up with ArrowUp', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Navigate down twice, then up once
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');

      // Second item should be selected
      const secondOption = dropdown.locator('[role="option"]').nth(1);
      await expect(secondOption).toHaveAttribute('aria-selected', 'true');
    });

    test('should select agent with Enter key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Press Enter to select first option
      await page.keyboard.press('Enter');

      // Dropdown should close
      await expect(dropdown).not.toBeVisible();

      // Input should contain the @mention
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toMatch(/@[\w-]+/);
    });

    test('should select agent with Tab key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Press Tab to select
      await page.keyboard.press('Tab');

      // Dropdown should close
      await expect(dropdown).not.toBeVisible();

      // Input should contain the @mention
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toMatch(/@[\w-]+/);
    });

    test('should close dropdown with Escape key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Dropdown should close
      await expect(dropdown).not.toBeVisible();

      // Text should remain
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toBe('@');
    });
  });

  test.describe('Mouse Selection', () => {
    test('should select agent on click', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Click on an option
      const firstOption = dropdown.locator('[role="option"]').first();
      await firstOption.click();

      // Dropdown should close
      await expect(dropdown).not.toBeVisible();

      // Input should contain the @mention
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toMatch(/@[\w-]+/);
    });
  });

  test.describe('Integration with Comment Submission', () => {
    test('should submit comment with @mention and trigger AI', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();

      // Type @mention and select agent
      await commentEditor.type('@');
      await page.keyboard.press('Enter'); // Select first agent
      await commentEditor.type('analyze this task');

      // Click Comment button
      const commentButton = page.locator('button:has-text("Comment")').first();
      await commentButton.click();

      // Should either show the comment or navigate to attempt page
      await page.waitForTimeout(2000);

      const hasNavigated = page.url().includes('/attempts/');
      const commentSaved = await page.locator('text=analyze this task').isVisible().catch(() => false);

      expect(hasNavigated || commentSaved).toBeTruthy();
    });

    test('should preserve other text when selecting agent', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();

      // Type some text first
      await commentEditor.type('Hello ');

      // Then type @mention
      await commentEditor.type('@');
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Select agent
      await page.keyboard.press('Enter');

      // Verify text preserved
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toMatch(/^Hello @[\w-]+ /);
    });
  });

  test.describe('Dropdown Positioning', () => {
    test('should position dropdown above textarea', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@');

      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      // Get positions
      const textareaBox = await commentEditor.boundingBox();
      const dropdownBox = await dropdown.boundingBox();

      // Dropdown should be above textarea
      if (textareaBox && dropdownBox) {
        expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(textareaBox.y + 10);
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle no agents configured gracefully', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      // This test verifies that if no agents are configured,
      // the dropdown simply doesn't appear

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();
      await commentEditor.type('@invalid-agent-name');

      // Dropdown should not be visible for invalid input
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).not.toBeVisible();
    });

    test('should work with markdown formatting alongside @mention', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and agents configured');

      await page.goto('/teams/IKA/issues');
      const taskItem = page.locator('[data-testid="task-item"]').first();
      await taskItem.click();

      const commentEditor = page.locator('textarea').first();

      // Add markdown formatting
      await commentEditor.type('**Bold text** ');

      // Then add @mention
      await commentEditor.type('@');
      const dropdown = page.locator('[role="listbox"]');
      await expect(dropdown).toBeVisible();

      await page.keyboard.press('Enter');
      await commentEditor.type('analyze this');

      // Verify formatting preserved
      const inputValue = await commentEditor.inputValue();
      expect(inputValue).toContain('**Bold text**');
      expect(inputValue).toMatch(/@[\w-]+/);
    });
  });
});
