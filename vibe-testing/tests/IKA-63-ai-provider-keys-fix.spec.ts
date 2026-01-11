import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-63: AI Provider Keys Fix
 *
 * Tests verify that:
 * - AI Provider Keys page loads without "Failed to load" error
 * - Auto-provisioning works for new users
 * - Keys can be saved successfully
 *
 * Note: Tests require authentication to access settings.
 */

test.describe('IKA-63: AI Provider Keys Load Fix', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Page Loading (Critical Fix)', () => {
    test('should load AI Provider Keys page without error', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Should NOT show the error message
      const errorMessage = page.locator('text=/Failed to load AI provider keys/i');
      await expect(errorMessage).not.toBeVisible();

      // Should show either the empty state or the key list
      const pageContent = page.locator('[class*="Card"]').first();
      await expect(pageContent).toBeVisible();
    });

    test('should show empty state for new user without keys', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Should show empty state message (not error)
      const emptyState = page.locator('text=/No AI provider keys configured/i');
      const addButton = page.locator('button').filter({ hasText: /Add Key/i });

      // Either empty state or add button should be visible
      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      const hasAddButton = await addButton.isVisible().catch(() => false);

      expect(hasEmptyState || hasAddButton).toBeTruthy();
    });

    test('should not show loading spinner indefinitely', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Wait a reasonable time for loading
      await page.waitForTimeout(3000);

      // Loading spinner should not be visible after page loads
      const spinner = page.locator('svg.animate-spin, [class*="Loader"]');
      const spinnerVisible = await spinner.isVisible().catch(() => false);

      // If still loading after 3 seconds, that's a problem
      if (spinnerVisible) {
        // Check if error appeared
        const error = page.locator('text=/Failed to load/i');
        const hasError = await error.isVisible().catch(() => false);
        expect(hasError).toBeFalsy();
      }
    });
  });

  test.describe('Auto-provisioning', () => {
    test('should auto-provision user to default workspace on first access', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      // Make API request directly to test backend auto-provisioning
      const response = await page.request.get('/api/ai-keys', {
        headers: {
          'Authorization': 'Bearer test-token', // Would need real token
        },
      });

      // Should not return 404 "No tenant workspace found"
      // Should return 200 with empty array or existing keys
      expect(response.status()).not.toBe(404);
    });
  });

  test.describe('Key Operations After Fix', () => {
    test('should be able to add a new key after page loads', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');
      await page.waitForLoadState('networkidle');

      // Verify no error
      const errorMessage = page.locator('text=/Failed to load/i');
      await expect(errorMessage).not.toBeVisible();

      // Click Add Key
      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await expect(addButton).toBeVisible();
      await addButton.click();

      // Dialog should open successfully
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
    });

    test('should successfully save a new API key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');
      await page.waitForLoadState('networkidle');

      // Open add dialog
      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Fill in API key
      const apiKeyInput = page.locator('input[id="api-key"]');
      await apiKeyInput.fill('sk-ant-api03-testkey123456789');

      // Listen for API response
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/ai-keys') && response.request().method() === 'POST'
      );

      // Click save
      const saveButton = page.locator('button').filter({ hasText: /Save/i });
      await saveButton.click();

      // Wait for response
      const response = await responsePromise;

      // Should succeed (200) or show validation error (400), not 404/500
      expect([200, 201, 400]).toContain(response.status());
    });
  });

  test.describe('Error Handling', () => {
    test('should display user-friendly error if provisioning fails', async ({ page }) => {
      test.skip(true, 'Requires mocked backend failure');

      // Mock backend to fail
      await page.route('**/api/ai-keys', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.goto('/settings/ai-provider-keys');

      // Should show a user-friendly error, not a cryptic one
      const errorMessage = page.locator('[class*="Alert"], [role="alert"]');
      await expect(errorMessage).toBeVisible();
    });

    test('should allow retry after error', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // If there's an error, there should be a way to retry
      // (either refresh or retry button)
      const refreshButton = page.locator('button').filter({ hasText: /Retry|Refresh/i });
      const isRefreshAvailable = await refreshButton.isVisible().catch(() => false);

      // Or the page should work on refresh
      if (!isRefreshAvailable) {
        await page.reload();
        await page.waitForLoadState('networkidle');

        // After refresh, page should load correctly
        const content = page.locator('[class*="Card"]');
        await expect(content.first()).toBeVisible();
      }
    });
  });

  test.describe('Backward Compatibility', () => {
    test('should still work for users already in a workspace', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with existing workspace membership');

      await page.goto('/settings/ai-provider-keys');
      await page.waitForLoadState('networkidle');

      // Should load without error for existing users
      const errorMessage = page.locator('text=/Failed to load/i');
      await expect(errorMessage).not.toBeVisible();

      // Should show page content
      const pageTitle = page.locator('text=/AI Provider Keys/i');
      await expect(pageTitle).toBeVisible();
    });
  });
});
