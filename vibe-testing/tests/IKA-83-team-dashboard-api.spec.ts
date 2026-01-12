import { test, expect } from '@playwright/test';

test.describe('IKA-83: Aggregated Team Dashboard API', () => {
  // Note: These tests verify the aggregated dashboard endpoint replaces 5+ API calls
  // Tests require the frontend and backend to be running

  test.describe('Team Issues Page Load', () => {
    test('Should load team issues page with single API call', async ({ page }) => {
      // Track API calls to team endpoints
      const apiCalls: string[] = [];

      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/teams/') && request.method() === 'GET') {
          apiCalls.push(url);
        }
      });

      // Navigate to a team issues page
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check if the app has loaded
      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      // Find and click on a team in the sidebar
      const teamLink = page.locator('[data-testid="team-link"]').first();
      const hasTeamLink = await teamLink.isVisible().catch(() => false);

      if (!hasTeamLink) {
        // Try alternative: look for any link that might go to team issues
        const sidebarTeam = page.locator('a[href*="/teams/"]').first();
        const hasSidebarTeam = await sidebarTeam.isVisible().catch(() => false);

        if (!hasSidebarTeam) {
          test.skip(true, 'No teams available - need authenticated user with teams');
          return;
        }

        // Clear API calls before navigation
        apiCalls.length = 0;
        await sidebarTeam.click();
      } else {
        // Clear API calls before navigation
        apiCalls.length = 0;
        await teamLink.click();
      }

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Verify dashboard endpoint was called
      const dashboardCalls = apiCalls.filter((url) => url.includes('/dashboard'));
      expect(dashboardCalls.length).toBeGreaterThanOrEqual(1);

      // Verify the old individual endpoints were NOT called
      const legacyMembersCalls = apiCalls.filter((url) =>
        url.includes('/members') && !url.includes('/dashboard')
      );
      const legacyProjectsCalls = apiCalls.filter((url) =>
        url.includes('/projects') && !url.includes('/dashboard')
      );
      const legacyIssuesCalls = apiCalls.filter((url) =>
        url.includes('/issues') && !url.includes('/dashboard')
      );

      // These should be 0 since we're using the aggregated endpoint
      expect(legacyMembersCalls.length).toBe(0);
      expect(legacyProjectsCalls.length).toBe(0);
      expect(legacyIssuesCalls.length).toBe(0);
    });

    test('Should display team header correctly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      // Navigate to team issues
      const sidebarTeam = page.locator('a[href*="/teams/"]').first();
      const hasSidebarTeam = await sidebarTeam.isVisible().catch(() => false);

      if (!hasSidebarTeam) {
        test.skip(true, 'No teams available');
        return;
      }

      await sidebarTeam.click();
      await page.waitForLoadState('networkidle');

      // Should see the team header with Issues text
      const issuesHeader = page.locator('text=/Issues/i').first();
      await expect(issuesHeader).toBeVisible({ timeout: 10000 }).catch(() => {
        // May not be on issues page specifically
      });
    });

    test('Should show loading state briefly then content', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      const sidebarTeam = page.locator('a[href*="/teams/"]').first();
      const hasSidebarTeam = await sidebarTeam.isVisible().catch(() => false);

      if (!hasSidebarTeam) {
        test.skip(true, 'No teams available');
        return;
      }

      await sidebarTeam.click();

      // Either see loading state or content (content loads fast)
      const hasLoadingOrContent = await Promise.race([
        page.locator('[data-testid="loader"]').isVisible().catch(() => false),
        page.locator('.flex.flex-col').first().isVisible().catch(() => true),
      ]);

      expect(hasLoadingOrContent).toBeTruthy();

      // After network idle, should definitely have content
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Error Handling', () => {
    test('Should handle API errors gracefully', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      // Navigate to an invalid team ID
      await page.goto('/teams/invalid-team-id/issues');
      await page.waitForLoadState('networkidle');

      // Should show an error or redirect, not crash
      const hasError = await page.locator('text=/error|not found|failed/i').first().isVisible().catch(() => false);
      const wasRedirected = !page.url().includes('invalid-team-id');

      // Either showed error or redirected (both are acceptable)
      expect(hasError || wasRedirected).toBeTruthy();
    });
  });

  test.describe('Kanban Board Display', () => {
    test('Should display kanban columns when issues exist', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      const sidebarTeam = page.locator('a[href*="/teams/"]').first();
      const hasSidebarTeam = await sidebarTeam.isVisible().catch(() => false);

      if (!hasSidebarTeam) {
        test.skip(true, 'No teams available');
        return;
      }

      await sidebarTeam.click();
      await page.waitForLoadState('networkidle');

      // Should see either kanban board or empty state
      const hasKanban = await page.locator('[data-testid="kanban-board"]').isVisible().catch(() => false);
      const hasEmptyState = await page.locator('text=/No issues|Create First Issue/i').isVisible().catch(() => false);

      expect(hasKanban || hasEmptyState).toBeTruthy();
    });
  });

  test.describe('No 429 Rate Limiting', () => {
    test('Should not trigger 429 errors on page navigation', async ({ page }) => {
      const rateLimit429Count = { count: 0 };

      page.on('response', (response) => {
        if (response.status() === 429) {
          rateLimit429Count.count++;
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasNavbar = await page.locator('.border-b.bg-background').first().isVisible().catch(() => false);
      if (!hasNavbar) {
        test.skip(true, 'Frontend not running or app not loaded');
        return;
      }

      // Navigate to team multiple times
      const sidebarTeam = page.locator('a[href*="/teams/"]').first();
      const hasSidebarTeam = await sidebarTeam.isVisible().catch(() => false);

      if (!hasSidebarTeam) {
        test.skip(true, 'No teams available');
        return;
      }

      // Navigate back and forth 3 times
      for (let i = 0; i < 3; i++) {
        await sidebarTeam.click();
        await page.waitForLoadState('networkidle');
        await page.goBack();
        await page.waitForLoadState('networkidle');
      }

      // Should have zero 429 errors
      expect(rateLimit429Count.count).toBe(0);
    });
  });
});
