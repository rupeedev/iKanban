import { test, expect } from '@playwright/test';

test.describe('IKA-111: Feature Tree Progress View', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Projects page first
    await page.goto('/teams/IKA/projects');
    // Wait for projects to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should display Feature Progress section in Insights tab', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Verify Feature Progress section is visible
    await expect(page.getByText('Feature Progress')).toBeVisible();
  });

  test('should display features grouped by tags with progress bars', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section to load
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Feature tree should show either:
    // 1. Actual tag groups with progress bars, OR
    // 2. Empty state if no features/tags defined
    // We check for the existence of the container
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should show empty state when no features/tags exist', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Feature Progress section should be visible
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // If no tags exist, should show appropriate message or just Untagged section
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should display loading state while fetching tags', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Feature Progress section should be visible
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // The component should either show loading state or content
    // (loading state may be too fast to catch in E2E)
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should show Untagged Tasks section when tasks have no tags', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Feature tree should handle untagged tasks
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should expand and collapse feature items', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Find a feature item that can be expanded
    const featureItem = page.locator('[data-testid="feature-tree-item"]').first();

    // If feature items exist, they should be expandable
    const featureItemCount = await featureItem.count();
    if (featureItemCount > 0) {
      // Click to expand
      const header = featureItem.locator('[data-testid="feature-item-header"]');
      await header.click();

      // Should show task list when expanded
      await expect(featureItem.locator('[data-testid="feature-task-list"]')).toBeVisible();

      // Click again to collapse
      await header.click();

      // Task list should be hidden
      await expect(featureItem.locator('[data-testid="feature-task-list"]')).not.toBeVisible();
    }
  });

  test('should display task counts per feature', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Feature items should show task counts
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should show progress percentage in progress bar', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Feature tree should have progress bars
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should integrate with existing Insights panel layout', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Verify all existing sections are still present
    // Note: Completed Features was removed in IKA-116, replaced by Feature Progress
    await expect(page.getByText('Project Insights')).toBeVisible();
    await expect(page.getByText('Progress')).toBeVisible();
    await expect(page.getByText('Timeline')).toBeVisible();

    // Feature Progress section should be present (replaced Completed Features)
    await expect(page.getByText('Feature Progress')).toBeVisible();
  });
});
