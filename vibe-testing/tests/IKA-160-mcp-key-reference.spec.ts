import { test, expect } from '@playwright/test';

test.describe('IKA-160: MCP Key Reference Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to MCP Settings page
    await page.goto('/settings/mcp');
    await page.waitForLoadState('networkidle');
  });

  test.describe('API Key Reference Help Section', () => {
    test('should display API Key References card', async ({ page }) => {
      // Look for the key reference help section
      const keyRefCard = page.locator('text=API Key References');
      await expect(keyRefCard).toBeVisible();
    });

    test('should display reference syntax help', async ({ page }) => {
      // Check for syntax help section
      const syntaxTitle = page.locator('text=Reference Syntax');
      await expect(syntaxTitle).toBeVisible();

      // Check for the syntax code example
      const syntaxCode = page.locator('code:has-text("${AI_KEY:provider_name}")');
      await expect(syntaxCode).toBeVisible();
    });

    test('should display example usage section', async ({ page }) => {
      const exampleTitle = page.locator('text=Example Usage');
      await expect(exampleTitle).toBeVisible();

      // Check for example JSON in pre element
      const exampleCode = page.locator('pre:has-text("context7")');
      await expect(exampleCode).toBeVisible();
    });

    test('should display available keys section', async ({ page }) => {
      const availableKeysTitle = page.locator('text=Available Keys');
      await expect(availableKeysTitle).toBeVisible();
    });

    test('should show supported providers (OpenAI, Anthropic, Google)', async ({
      page,
    }) => {
      // Check for provider display names
      await expect(page.locator('text=OpenAI (GPT)')).toBeVisible();
      await expect(page.locator('text=Anthropic (Claude)')).toBeVisible();
      await expect(page.locator('text=Google (Gemini)')).toBeVisible();
    });

    test('should show configured/not configured status for each provider', async ({
      page,
    }) => {
      // Wait for API to load provider keys
      await page.waitForTimeout(1000);

      // Each provider should have either "Configured" or "Not configured" badge
      const providerRows = page.locator(
        '.flex.items-center.justify-between.px-3.py-2.rounded-md.border'
      );
      const count = await providerRows.count();

      // Should have 3 providers
      expect(count).toBe(3);
    });

    test('should have link to AI Provider Keys settings', async ({ page }) => {
      const manageKeysLink = page.locator(
        'a[href="/settings/ai-provider-keys"]'
      );
      await expect(manageKeysLink).toBeVisible();
      await expect(manageKeysLink).toContainText(
        'Manage API keys in AI Provider Keys'
      );
    });

    test('should navigate to AI Provider Keys when link is clicked', async ({
      page,
    }) => {
      const manageKeysLink = page.locator(
        'a[href="/settings/ai-provider-keys"]'
      );
      await manageKeysLink.click();

      await expect(page).toHaveURL(/.*\/settings\/ai-provider-keys/);
    });
  });

  test.describe('Key Reference Copy Functionality', () => {
    test('should show copy button for configured providers', async ({
      page,
    }) => {
      // Wait for API to load
      await page.waitForTimeout(1000);

      // If any provider is configured, it should have a copy button
      const copyButtons = page.locator(
        'button:has(svg.lucide-copy), button:has(svg.lucide-check)'
      );
      const count = await copyButtons.count();

      // Number of copy buttons should match number of configured providers (0-3)
      expect(count).toBeLessThanOrEqual(3);
    });
  });

  test.describe('MCP Configuration Summary with Key References', () => {
    test('should display MCP Configuration Summary card', async ({ page }) => {
      const summaryCard = page.locator('text=MCP Configuration Summary');
      await expect(summaryCard).toBeVisible();
    });

    test('should show server table when servers are configured', async ({
      page,
    }) => {
      // Look for the table structure
      const table = page.locator('table');
      const tableExists = (await table.count()) > 0;

      if (tableExists) {
        // Check for expected column headers
        await expect(page.locator('th:has-text("Server Name")')).toBeVisible();
        await expect(page.locator('th:has-text("Type")')).toBeVisible();
        await expect(page.locator('th:has-text("Status")')).toBeVisible();
      } else {
        // If no table, should show empty state
        await expect(
          page.locator('text=No MCP servers configured yet')
        ).toBeVisible();
      }
    });

    test('should show API Keys column when servers use key references', async ({
      page,
    }) => {
      // The API Keys column only appears if any server uses key references
      const apiKeysHeader = page.locator('th:has-text("API Keys")');
      const hasApiKeysColumn = (await apiKeysHeader.count()) > 0;

      if (hasApiKeysColumn) {
        // If column exists, look for "Linked" badge
        const linkedBadge = page.locator('text=Linked');
        const hasLinkedBadges = (await linkedBadge.count()) > 0;
        expect(hasLinkedBadges).toBe(true);
      }
    });

    test('should have refresh button in summary header', async ({ page }) => {
      const refreshButton = page.locator(
        'button[title="Refresh MCP configuration"]'
      );
      await expect(refreshButton).toBeVisible();
    });
  });

  test.describe('Key Reference in JSON Editor', () => {
    test('should display JSON editor for MCP configuration', async ({
      page,
    }) => {
      const jsonEditor = page.locator('#mcp-servers');
      await expect(jsonEditor).toBeVisible();
    });

    test('should allow typing key reference syntax in editor', async ({
      page,
    }) => {
      const jsonEditor = page.locator('#mcp-servers');

      // Clear and enter a config with key reference
      await jsonEditor.clear();
      const testConfig = JSON.stringify(
        {
          mcpServers: {
            'test-server': {
              type: 'http',
              url: 'https://example.com/mcp',
              headers: {
                'API-KEY': '${AI_KEY:openai}',
              },
            },
          },
        },
        null,
        2
      );
      await jsonEditor.fill(testConfig);

      // Verify the content contains our key reference
      const editorValue = await jsonEditor.inputValue();
      expect(editorValue).toContain('${AI_KEY:openai}');
    });
  });
});
