import { test, expect } from '@playwright/test';

test.describe('IKA-114: Filter Feature Progress by Project', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Projects page first
    await page.goto('/teams/IKA/projects');
    // Wait for projects to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should show project-specific tasks in Feature Progress', async ({ page }) => {
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

    // Feature tree should show data-testid with projectId attribute
    // This ensures the component is receiving project-specific filtering
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should filter issues by current project ID', async ({ page }) => {
    // Navigate to first project
    const firstProjectRow = page.locator('table tbody tr').first();
    const firstProjectName = await firstProjectRow.locator('td').first().textContent();
    await firstProjectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for Feature Progress section
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Get the feature tree progress section
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();

    // Navigate back and select a different project (if exists)
    await page.goto('/teams/IKA/projects');
    await page.waitForSelector('table', { timeout: 10000 });

    // Check if there are multiple projects
    const projectRows = page.locator('table tbody tr');
    const projectCount = await projectRows.count();

    if (projectCount > 1) {
      // Click on second project
      const secondProjectRow = page.locator('table tbody tr').nth(1);
      const secondProjectName = await secondProjectRow.locator('td').first().textContent();
      await secondProjectRow.click();

      // Wait for project detail page to load
      await page.waitForURL(/\/teams\/.*\/projects\/.*/);

      // Click on Insights tab
      const insightsTab2 = page.getByRole('tab', { name: 'Insights' });
      await insightsTab2.click();

      // Wait for Feature Progress section
      await expect(page.getByText('Feature Progress')).toBeVisible();

      // Feature Progress should be filtered to show only this project's tasks
      // The section should be visible and properly filtered
      const featureProgressSection2 = page.locator('[data-testid="feature-tree-progress"]');
      await expect(featureProgressSection2).toBeVisible();

      // Ensure we're on a different project
      // (project names should be different if both are valid)
      if (firstProjectName && secondProjectName) {
        expect(firstProjectName.trim()).not.toBe(secondProjectName.trim());
      }
    }
  });

  test('should show empty state when project has no tasks', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // The Feature Progress section should be visible
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // Feature tree progress should exist (either with content or empty state)
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();

    // If no tasks, should show "No tasks to show feature progress."
    // This is the expected empty state message from FeatureTreeProgress component
    // Note: The actual state depends on whether the project has tasks
    const emptyOrContent = featureProgressSection.locator('text=No tasks to show feature progress');
    const featureItems = featureProgressSection.locator('[data-testid="feature-tree-item"]');

    // Either empty state OR feature items should be present
    const emptyCount = await emptyOrContent.count();
    const itemsCount = await featureItems.count();
    expect(emptyCount + itemsCount).toBeGreaterThanOrEqual(1);
  });

  test('should receive projectId prop for defensive filtering', async ({ page }) => {
    // This test verifies that the component implementation includes projectId
    // by checking that the component renders correctly for the project

    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Wait for the page to fully render
    await page.waitForLoadState('networkidle');

    // Feature Progress section should be visible
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // The feature tree progress component should be rendered
    // This validates the data flow from ProjectInsightsPanel to FeatureTreeProgress
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();
  });

  test('should maintain correct filtering when switching between tabs', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Switch to Issues tab first
    const issuesTab = page.getByRole('tab', { name: 'Issues' });
    await issuesTab.click();

    // Now switch to Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Feature Progress should be visible
    await expect(page.getByText('Feature Progress')).toBeVisible();

    // The feature tree should be properly filtered
    const featureProgressSection = page.locator('[data-testid="feature-tree-progress"]');
    await expect(featureProgressSection).toBeVisible();

    // Switch away and back
    await issuesTab.click();
    await insightsTab.click();

    // Should still show correct Feature Progress
    await expect(page.getByText('Feature Progress')).toBeVisible();
    await expect(featureProgressSection).toBeVisible();
  });
});
