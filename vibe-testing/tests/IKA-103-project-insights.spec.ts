import { test, expect } from '@playwright/test';

test.describe('IKA-103: Project Insights Tab', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Projects page first
    await page.goto('/teams/IKA/projects');
    // Wait for projects to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('should display Insights tab on Project Detail page', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Verify the Insights tab exists
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await expect(insightsTab).toBeVisible();
  });

  test('should show insights panel when clicking Insights tab', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Verify insights panel content shows
    await expect(page.getByText('Project Insights')).toBeVisible();
  });

  test('should display Progress card with task counts', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Look for Progress card
    const progressCard = page.locator('text=Progress').first();
    await expect(progressCard).toBeVisible();

    // Should show task completion text
    await expect(page.getByText(/tasks completed/)).toBeVisible();

    // Should show percentage
    await expect(page.getByText(/% complete/)).toBeVisible();
  });

  test('should display Timeline card with dates', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Look for Timeline card
    const timelineCard = page.locator('text=Timeline').first();
    await expect(timelineCard).toBeVisible();

    // Should show started date
    await expect(page.getByText('Started')).toBeVisible();

    // Should show days active
    await expect(page.getByText('Days Active')).toBeVisible();

    // Should show target date
    await expect(page.getByText('Target')).toBeVisible();

    // Should show velocity
    await expect(page.getByText('Velocity')).toBeVisible();
  });

  test('should display Completed Features section', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Look for Completed Features section
    const completedSection = page.locator('text=Completed Features').first();
    await expect(completedSection).toBeVisible();
  });

  test('should switch between tabs correctly', async ({ page }) => {
    // Click on a project row to navigate to detail page
    const projectRow = page.locator('table tbody tr').first();
    await projectRow.click();

    // Wait for project detail page to load
    await page.waitForURL(/\/teams\/.*\/projects\/.*/);

    // Click on Insights tab
    const insightsTab = page.getByRole('tab', { name: 'Insights' });
    await insightsTab.click();

    // Verify insights content visible
    await expect(page.getByText('Project Insights')).toBeVisible();

    // Click on Issues tab
    const issuesTab = page.getByRole('tab', { name: 'Issues' });
    await issuesTab.click();

    // Verify insights content no longer visible and issues content shows
    await expect(page.getByText('Project Insights')).not.toBeVisible();

    // Click back to Insights tab
    await insightsTab.click();

    // Verify insights content visible again
    await expect(page.getByText('Project Insights')).toBeVisible();
  });
});
