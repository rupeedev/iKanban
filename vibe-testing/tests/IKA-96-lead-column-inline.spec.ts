import { test, expect } from '@playwright/test';

/**
 * Test suite for IKA-96: Project Lead Column Inline Edit
 *
 * These tests cover:
 * - Lead column displays member avatar and name when assigned
 * - Lead column shows "—" when no lead assigned
 * - Inline dropdown for changing lead
 * - "No lead" option removes lead assignment
 * - Selecting a team member assigns them as lead
 *
 * Note: Tests require authenticated session and team/project setup.
 */

test.describe('IKA-96: Project Lead Column Inline Edit', () => {
  test.describe.configure({ mode: 'parallel' });

  test.describe('Lead Column Display', () => {
    test('should display lead column in projects table', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      // Navigate to team projects page
      await page.goto('/teams/IKA/projects');

      // Verify Lead column header is visible
      const leadHeader = page.locator('th', { hasText: 'Lead' });
      await expect(leadHeader).toBeVisible();
    });

    test('should show dash when no lead is assigned', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Find a project row without lead assigned (should show "—")
      const leadCell = page.locator('td').filter({ hasText: '—' });
      await expect(leadCell.first()).toBeVisible();
    });

    test('should show avatar and name when lead is assigned', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Look for avatar component in lead column
      const avatarInLeadColumn = page.locator('[data-slot="avatar"]');
      // If any project has a lead, avatar should be visible
      await expect(avatarInLeadColumn.first()).toBeVisible();
    });
  });

  test.describe('Lead Dropdown Functionality', () => {
    test('should open dropdown when clicking lead cell', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Click on lead cell to open dropdown
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Dropdown should be visible with options
      const dropdownContent = page.locator('[role="menu"]');
      await expect(dropdownContent).toBeVisible();
    });

    test('should show "No lead" option in dropdown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Open lead dropdown for first project
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Look for "No lead" option
      const noLeadOption = page.locator('[role="menuitem"]', { hasText: 'No lead' });
      await expect(noLeadOption).toBeVisible();
    });

    test('should show team members in dropdown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Open lead dropdown
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Should have at least one team member option (plus "No lead")
      const menuItems = page.locator('[role="menuitem"]');
      await expect(menuItems).toHaveCount({ min: 2 });
    });

    test('should display member avatars in dropdown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Open lead dropdown
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Member options should have avatars
      const avatarsInDropdown = page.locator('[role="menu"] [data-slot="avatar"]');
      await expect(avatarsInDropdown.first()).toBeVisible();
    });
  });

  test.describe('Lead Assignment', () => {
    test('should update lead when selecting a team member', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Store original lead state
      const firstProjectRow = page.locator('tbody tr').first();

      // Open lead dropdown
      const leadButton = firstProjectRow.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') }).nth(2); // 3rd button is lead (after health, priority)
      await leadButton.click();

      // Select a team member (first member option after "No lead")
      const memberOption = page.locator('[role="menuitem"]').nth(1);
      const memberName = await memberOption.textContent();
      await memberOption.click();

      // Verify the lead column now shows the selected member
      if (memberName && memberName !== 'No lead') {
        await expect(firstProjectRow).toContainText(memberName.trim());
      }
    });

    test('should remove lead when selecting "No lead"', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      const firstProjectRow = page.locator('tbody tr').first();

      // Open lead dropdown
      const leadButton = firstProjectRow.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') }).nth(2);
      await leadButton.click();

      // Select "No lead"
      const noLeadOption = page.locator('[role="menuitem"]', { hasText: 'No lead' });
      await noLeadOption.click();

      // Lead cell should now show "—"
      const leadCell = firstProjectRow.locator('td').nth(3); // Lead is 4th column
      await expect(leadCell).toContainText('—');
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle empty team (no members)', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team with no members');

      await page.goto('/teams/IKA/projects');

      // Open lead dropdown
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Should at least show "No lead" option
      const noLeadOption = page.locator('[role="menuitem"]', { hasText: 'No lead' });
      await expect(noLeadOption).toBeVisible();
    });

    test('should not navigate to project when clicking lead dropdown', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and team/project setup');

      await page.goto('/teams/IKA/projects');

      // Click on lead cell (should stop propagation)
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // URL should not change (dropdown opened, not navigated)
      await expect(page).toHaveURL('/teams/IKA/projects');
    });
  });

  test.describe('Avatar Fallback', () => {
    test('should show initials when member has no avatar', async ({ page }) => {
      test.skip(true, 'Requires authenticated session and member without avatar');

      await page.goto('/teams/IKA/projects');

      // Open lead dropdown
      const leadButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') });
      await leadButton.first().click();

      // Avatar fallback should show initials (text content)
      const avatarFallback = page.locator('[role="menu"] [data-slot="avatar-fallback"]');
      // Should contain 1-2 uppercase letters
      await expect(avatarFallback.first()).toHaveText(/^[A-Z?]{1,2}$/);
    });
  });
});
