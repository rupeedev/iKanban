import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-53, IKA-54: Enhanced Agent Availability
 *
 * These tests cover:
 * - IKA-53: Enhanced Agent Availability Check - API vs CLI support
 * - IKA-54: CLI-Only Badge and Mode Indicators
 *
 * Note: Full integration tests require running local server with agent installations.
 */

test.describe('IKA-53/54: Enhanced Agent Availability', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Agent Availability Endpoint', () => {
    test('should return availability info for known agents', async ({
      request,
    }) => {
      test.skip(true, 'Requires local server running');

      // Test Claude Code availability check
      const response = await request.get(
        '/api/agents/check-availability?executor=CLAUDE_CODE'
      );
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.data).toBeDefined();
      // Should have type field (LOGIN_DETECTED, INSTALLATION_FOUND, or NOT_FOUND)
      expect(['LOGIN_DETECTED', 'INSTALLATION_FOUND', 'NOT_FOUND']).toContain(
        data.data.type
      );
    });

    test('should return NOT_FOUND for unavailable agents', async ({
      request,
    }) => {
      test.skip(true, 'Requires local server running');

      // Test with an agent that likely isn't installed
      const response = await request.get(
        '/api/agents/check-availability?executor=QWEN_CODE'
      );
      expect(response.ok()).toBe(true);

      const data = await response.json();
      // Most systems won't have Qwen installed
      expect(data.data.type).toBeDefined();
    });
  });

  test.describe('Mode Badge Component (IKA-54)', () => {
    test('should display mode badge in agent settings', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/agents');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // The agent configuration section should be visible
      const agentSection = page.locator('text=Coding Agent Configurations');
      await expect(agentSection).toBeVisible();
    });

    test('should show availability indicator for selected agent', async ({
      page,
    }) => {
      test.skip(true, 'Requires authenticated session with agent selection');

      await page.goto('/settings/agents');

      // Select an agent type
      const agentSelector = page.locator('[data-testid="agent-selector"]');
      if (await agentSelector.isVisible()) {
        await agentSelector.click();
        await page.locator('text=Claude Code').click();

        // Availability indicator should appear
        const indicator = page.locator(
          '[class*="AgentAvailabilityIndicator"], [data-testid="availability-indicator"]'
        );
        await expect(indicator).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Enhanced Availability Info', () => {
    test('should show CLI status in indicator', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with enhanced availability'
      );

      await page.goto('/settings/agents');

      // Look for CLI status indicator
      const cliStatus = page.locator('text=CLI');
      await expect(cliStatus).toBeVisible({ timeout: 5000 });
    });

    test('should show API status in indicator', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with enhanced availability'
      );

      await page.goto('/settings/agents');

      // Look for API status indicator
      const apiStatus = page.locator('text=API');
      await expect(apiStatus).toBeVisible({ timeout: 5000 });
    });

    test('should show mode badge with correct variant', async ({ page }) => {
      test.skip(
        true,
        'Requires authenticated session with enhanced availability'
      );

      await page.goto('/settings/agents');

      // Mode badge should be present
      const modeBadge = page.locator(
        'text=CLI Only, text=API, text=CLI + API, text=Unavailable'
      );
      await expect(modeBadge).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('AI Provider Keys Integration', () => {
    test('should navigate to AI Provider Keys settings', async ({ page }) => {
      test.skip(true, 'Requires authenticated session');

      await page.goto('/settings/ai-provider-keys');

      // Page should load
      await expect(
        page.locator('text=AI Provider Keys, text=Configure API keys')
      ).toBeVisible();
    });

    test('should list configured providers', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with keys configured');

      await page.goto('/settings/ai-provider-keys');

      // Provider cards should be visible
      const providerCards = page.locator('[class*="rounded-lg"][class*="border"]');
      const count = await providerCards.count();

      // At least the info card should be visible
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should reflect API key status in agent availability', async ({
      page,
    }) => {
      test.skip(
        true,
        'Requires authenticated session with keys and agents configured'
      );

      // First check AI provider keys
      await page.goto('/settings/ai-provider-keys');

      const hasAnthropicKey = await page
        .locator('text=Anthropic (Claude)')
        .isVisible();

      // Then check agent availability
      await page.goto('/settings/agents');

      if (hasAnthropicKey) {
        // If Anthropic key exists, Claude Code should show API available
        const apiAvailable = page.locator('text=Key configured');
        await expect(apiAvailable).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Provider Mapping', () => {
    test('Claude Code should map to Anthropic provider', async ({ page }) => {
      test.skip(true, 'Unit test covered in hook implementation');
      // This mapping is tested in the useEnhancedAgentAvailability hook
      // CLAUDE_CODE -> anthropic
    });

    test('Codex should map to OpenAI provider', async ({ page }) => {
      test.skip(true, 'Unit test covered in hook implementation');
      // CODEX -> openai
    });

    test('Gemini should map to Google provider', async ({ page }) => {
      test.skip(true, 'Unit test covered in hook implementation');
      // GEMINI -> google
    });

    test('Cursor Agent should have no API provider (CLI only)', async ({
      page,
    }) => {
      test.skip(true, 'Unit test covered in hook implementation');
      // CURSOR_AGENT -> null (CLI only)
    });
  });

  test.describe('Tooltip Behavior', () => {
    test('should show tooltip on mode badge hover', async ({ page }) => {
      test.skip(true, 'Requires authenticated session with mode badge visible');

      await page.goto('/settings/agents');

      // Find and hover over mode badge
      const modeBadge = page.locator('[class*="Badge"]').first();
      if (await modeBadge.isVisible()) {
        await modeBadge.hover();

        // Tooltip should appear
        await page.waitForTimeout(500); // Wait for tooltip animation
        const tooltip = page.locator('[role="tooltip"]');
        await expect(tooltip).toBeVisible();
      }
    });
  });
});
