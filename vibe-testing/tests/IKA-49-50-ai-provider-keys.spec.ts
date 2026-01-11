import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-49, IKA-50: AI Provider API Keys Feature
 *
 * These tests cover:
 * - IKA-49: AI Provider API Keys Database Model and Storage
 * - IKA-50: AI Provider API Keys Settings UI
 *
 * Note: Tests require authentication to access settings.
 */

test.describe('IKA-49/50: AI Provider Keys', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Settings Navigation', () => {
    test('should have AI Provider Keys link in settings navigation', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings');

      // Check that the navigation link exists
      const navLink = page.locator('nav a[href*="ai-provider-keys"]');
      await expect(navLink).toBeVisible();
      await expect(navLink).toContainText('AI Provider Keys');
    });

    test('should navigate to AI Provider Keys settings page', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Verify page title
      const pageTitle = page.locator('h2, [class*="CardTitle"]').filter({ hasText: 'AI Provider Keys' });
      await expect(pageTitle).toBeVisible();
    });
  });

  test.describe('AI Provider Keys Settings Page (IKA-50)', () => {
    test('should display empty state when no keys are configured', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Check for empty state message
      const emptyMessage = page.locator('text=/No AI provider keys/i');
      await expect(emptyMessage).toBeVisible();
    });

    test('should have Add Key button', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await expect(addButton).toBeVisible();
    });

    test('should open add dialog when clicking Add Key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Dialog should open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Add AI Provider Key');
    });

    test('should display provider selection dropdown in add dialog', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Check for provider selector
      const providerSelect = page.locator('[role="combobox"], select').first();
      await expect(providerSelect).toBeVisible();
    });

    test('should have all three providers in selection', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Open provider dropdown
      const providerSelect = page.locator('[role="combobox"]').first();
      await providerSelect.click();

      // Check for all providers
      await expect(page.locator('[role="option"]').filter({ hasText: /Anthropic|Claude/i })).toBeVisible();
      await expect(page.locator('[role="option"]').filter({ hasText: /Google|Gemini/i })).toBeVisible();
      await expect(page.locator('[role="option"]').filter({ hasText: /OpenAI|GPT/i })).toBeVisible();
    });

    test('should have API key input field', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Check for API key input
      const apiKeyInput = page.locator('input[type="password"], input[type="text"]').filter({ hasText: '' }).last();
      await expect(apiKeyInput).toBeVisible();
    });

    test('should have password visibility toggle', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Check for eye/visibility toggle button
      const toggleButton = page.locator('button[type="button"]').filter({ has: page.locator('svg') }).last();
      await expect(toggleButton).toBeVisible();
    });

    test('should disable save button when API key is empty', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Save button should be disabled initially
      const saveButton = page.locator('button').filter({ hasText: /Save/i });
      await expect(saveButton).toBeDisabled();
    });

    test('should enable save button when API key is entered', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Enter an API key
      const apiKeyInput = page.locator('input[id="api-key"]');
      await apiKeyInput.fill('sk-ant-test123');

      // Save button should be enabled
      const saveButton = page.locator('button').filter({ hasText: /Save/i });
      await expect(saveButton).toBeEnabled();
    });

    test('should close dialog on cancel', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Click cancel
      const cancelButton = page.locator('button').filter({ hasText: /Cancel/i });
      await cancelButton.click();

      // Dialog should close
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Provider Key Management', () => {
    test('should display configured keys in a list', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Key list should be visible (if keys are configured)
      const keyList = page.locator('[class*="rounded-lg"][class*="border"]').filter({ hasText: /Anthropic|Google|OpenAI/i });
      await expect(keyList.first()).toBeVisible();
    });

    test('should show key prefix for security', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Key prefix should be visible (e.g., "sk-ant-a...")
      const keyPrefix = page.locator('code').filter({ hasText: /\.\.\.$/i });
      await expect(keyPrefix.first()).toBeVisible();
    });

    test('should have Test button for each key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Test button should be visible for each key
      const testButton = page.locator('button[title*="Test"]');
      await expect(testButton.first()).toBeVisible();
    });

    test('should have Update button for each key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Update button should be visible for each key
      const updateButton = page.locator('button').filter({ hasText: /Update/i });
      await expect(updateButton.first()).toBeVisible();
    });

    test('should have Delete button for each key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Delete button should be visible for each key
      const deleteButton = page.locator('button[title*="Delete"]');
      await expect(deleteButton.first()).toBeVisible();
    });

    test('should show validation status for each key', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Validation status should be visible
      const validStatus = page.locator('text=/Valid|Invalid/i');
      await expect(validStatus.first()).toBeVisible();
    });
  });

  test.describe('Delete Key Flow', () => {
    test('should open confirmation dialog when clicking delete', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      // Click delete on first key
      const deleteButton = page.locator('button[title*="Delete"]').first();
      await deleteButton.click();

      // Confirmation dialog should open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/Delete.*Key/i);
    });

    test('should show warning in delete confirmation', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      const deleteButton = page.locator('button[title*="Delete"]').first();
      await deleteButton.click();

      // Warning should be visible
      const warning = page.locator('text=/AI-powered features.*will stop working/i');
      await expect(warning).toBeVisible();
    });

    test('should close confirmation dialog on cancel', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys');

      await page.goto('/settings/ai-provider-keys');

      const deleteButton = page.locator('button[title*="Delete"]').first();
      await deleteButton.click();

      // Click cancel
      const cancelButton = page.locator('[role="dialog"] button').filter({ hasText: /Cancel/i });
      await cancelButton.click();

      // Dialog should close
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).not.toBeVisible();
    });
  });

  test.describe('Info Section', () => {
    test('should display supported providers info', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Info card should be visible
      const infoCard = page.locator('text=/Supported Providers/i');
      await expect(infoCard).toBeVisible();
    });

    test('should list all three providers in info section', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // All providers should be listed
      await expect(page.locator('text=/Anthropic.*Claude/i')).toBeVisible();
      await expect(page.locator('text=/Google.*Gemini/i')).toBeVisible();
      await expect(page.locator('text=/OpenAI.*GPT/i')).toBeVisible();
    });
  });

  test.describe('API Integration (IKA-49)', () => {
    test('should save key via API when submitting form', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and API mocking');

      await page.goto('/settings/ai-provider-keys');

      // Open add dialog
      const addButton = page.locator('button').filter({ hasText: /Add Key/i });
      await addButton.click();

      // Fill form
      const apiKeyInput = page.locator('input[id="api-key"]');
      await apiKeyInput.fill('sk-ant-api03-test123456789');

      // Submit and verify API call was made
      const [request] = await Promise.all([
        page.waitForRequest(req => req.url().includes('/api/ai-keys') && req.method() === 'POST'),
        page.locator('button').filter({ hasText: /Save/i }).click(),
      ]);

      expect(request).toBeTruthy();
    });

    test('should test key via API when clicking test button', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys and API mocking');

      await page.goto('/settings/ai-provider-keys');

      // Click test button and verify API call
      const [request] = await Promise.all([
        page.waitForRequest(req => req.url().includes('/api/ai-keys/') && req.url().includes('/test')),
        page.locator('button[title*="Test"]').first().click(),
      ]);

      expect(request).toBeTruthy();
    });

    test('should delete key via API when confirming delete', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with pre-configured keys and API mocking');

      await page.goto('/settings/ai-provider-keys');

      // Open delete dialog
      const deleteButton = page.locator('button[title*="Delete"]').first();
      await deleteButton.click();

      // Confirm and verify API call
      const [request] = await Promise.all([
        page.waitForRequest(req => req.url().includes('/api/ai-keys/') && req.method() === 'DELETE'),
        page.locator('[role="dialog"] button').filter({ hasText: /Delete/i }).click(),
      ]);

      expect(request).toBeTruthy();
    });
  });
});
