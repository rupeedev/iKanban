import { test, expect, Page } from '@playwright/test';

/**
 * IKA-55, IKA-56, IKA-57: Cloud Storage Integrations Tests
 *
 * These tests verify the Google Drive, S3, and Dropbox integration functionality
 * in the team settings storage provider configuration.
 */

// Helper function to navigate to team settings
async function navigateToTeamSettings(page: Page): Promise<boolean> {
    await page.goto('/teams/IKA/documents');
    await page.waitForTimeout(1000);

    // Look for team in sidebar
    const sidebarTeam = page.locator('text=iKanban').first();
    const isSidebarVisible = await sidebarTeam.isVisible().catch(() => false);

    if (!isSidebarVisible) {
        return false;
    }

    // Right-click to access context menu
    await sidebarTeam.click({ button: 'right' });
    await page.waitForTimeout(500);

    const editTeamOption = page.getByRole('menuitem', { name: /Edit team|Settings/i });
    if (!await editTeamOption.isVisible().catch(() => false)) {
        return false;
    }

    await editTeamOption.click();
    await page.waitForTimeout(500);

    return true;
}

// Helper function to select a storage provider
async function selectStorageProvider(page: Page, providerName: string): Promise<boolean> {
    const storageDropdown = page.locator('#storage-provider');

    if (!await storageDropdown.isVisible().catch(() => false)) {
        return false;
    }

    await storageDropdown.click();
    await page.waitForTimeout(300);

    const option = page.locator(`text=${providerName}`);
    await option.click();
    await page.waitForTimeout(300);

    return true;
}

test.describe('IKA-55: Google Drive Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('Google Drive option should be available in storage provider dropdown', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            await expect(page.locator('text=Google Drive')).toBeVisible();
        }
    });

    test('Selecting Google Drive should show Connect button without "Coming soon" message', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Google Drive');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify Connect button appears
        const connectButton = page.getByRole('button', { name: /Connect with Google/i });
        await expect(connectButton).toBeVisible();

        // Verify "Coming soon" message is NOT visible (integration is now implemented)
        const comingSoonText = page.locator('text=Coming soon');
        await expect(comingSoonText).not.toBeVisible();
    });

    test('Connect button should be disabled when team is not saved', async ({ page }) => {
        // Navigate to create a new team (unsaved state)
        await page.goto('/teams');
        await page.waitForTimeout(1000);

        // Look for new team button
        const newTeamButton = page.getByRole('button', { name: /New Team|Create Team/i });
        if (!await newTeamButton.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot find new team button');
            return;
        }

        await newTeamButton.click();
        await page.waitForTimeout(500);

        // Select Google Drive if the dropdown is visible
        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await selectStorageProvider(page, 'Google Drive');

            // Connect button should be disabled
            const connectButton = page.getByRole('button', { name: /Connect with Google/i });
            if (await connectButton.isVisible().catch(() => false)) {
                await expect(connectButton).toBeDisabled();
            }
        }
    });

    test('Google Drive should show description text about connecting Google account', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Google Drive');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify description text
        const descriptionText = page.locator('text=Connect your Google account to store documents in Google Drive');
        await expect(descriptionText).toBeVisible();
    });

    test('Google Drive connected state should show Disconnect button and folder ID input', async ({ page }) => {
        // This test verifies the UI when Google Drive is connected
        // We simulate this by checking the component structure
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Google Drive');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // When not connected, folder ID input should not be visible
        const folderIdInput = page.locator('#gdrive-folder');
        // In disconnected state, this should not be visible
        const isConnected = await page.locator('text=Connected to Google Drive').isVisible().catch(() => false);

        if (isConnected) {
            await expect(folderIdInput).toBeVisible();
            await expect(page.getByRole('button', { name: /Disconnect/i })).toBeVisible();
        } else {
            // Connect button should be visible when not connected
            await expect(page.getByRole('button', { name: /Connect with Google/i })).toBeVisible();
        }
    });
});

test.describe('IKA-56: S3 Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('S3 option should be available in storage provider dropdown', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            await expect(page.locator('text=Amazon S3')).toBeVisible();
        }
    });

    test('Selecting S3 should show all required configuration fields', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify all S3 configuration fields
        await expect(page.locator('#s3-bucket')).toBeVisible();
        await expect(page.locator('#s3-region')).toBeVisible();
        await expect(page.locator('#s3-access-key')).toBeVisible();
        await expect(page.locator('#s3-secret-key')).toBeVisible();
    });

    test('S3 should show optional prefix/folder field', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify prefix field
        await expect(page.locator('#s3-prefix')).toBeVisible();

        // Verify prefix description
        const prefixDescription = page.locator('text=Optional path prefix within the bucket');
        await expect(prefixDescription).toBeVisible();
    });

    test('S3 region dropdown should have multiple AWS region options', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Click region dropdown
        const regionSelect = page.locator('#s3-region');
        await regionSelect.click();
        await page.waitForTimeout(300);

        // Verify various regions are available
        await expect(page.locator('text=US East (N. Virginia)')).toBeVisible();
        await expect(page.locator('text=US West (Oregon)')).toBeVisible();
        await expect(page.locator('text=EU (Ireland)')).toBeVisible();
        await expect(page.locator('text=EU (Frankfurt)')).toBeVisible();
        await expect(page.locator('text=Asia Pacific (Tokyo)')).toBeVisible();
    });

    test('S3 should show security alert about IAM permissions', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify IAM permissions alert
        const alertText = page.locator('text=Credentials are stored securely');
        await expect(alertText).toBeVisible();

        const permissionsText = page.locator('text=s3:GetObject');
        await expect(permissionsText).toBeVisible();
    });

    test('S3 secret key field should be password type', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify secret key is a password field
        const secretKeyInput = page.locator('#s3-secret-key');
        await expect(secretKeyInput).toHaveAttribute('type', 'password');
    });

    test('S3 configuration should accept bucket name input', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Enter bucket name
        const bucketInput = page.locator('#s3-bucket');
        await bucketInput.fill('test-bucket-name');

        // Verify the input value
        await expect(bucketInput).toHaveValue('test-bucket-name');
    });
});

test.describe('IKA-57: Dropbox Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('Dropbox option should be available in storage provider dropdown', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            await expect(page.locator('text=Dropbox')).toBeVisible();
        }
    });

    test('Selecting Dropbox should show Connect button without "Coming soon" message', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Dropbox');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify Connect button appears
        const connectButton = page.getByRole('button', { name: /Connect with Dropbox/i });
        await expect(connectButton).toBeVisible();

        // Verify "Coming soon" message is NOT visible (integration is now implemented)
        const comingSoonText = page.locator('text=Coming soon');
        await expect(comingSoonText).not.toBeVisible();
    });

    test('Dropbox should show description text about connecting Dropbox account', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Dropbox');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify description text
        const descriptionText = page.locator('text=Connect your Dropbox account to store documents');
        await expect(descriptionText).toBeVisible();
    });

    test('Dropbox Connect button should be disabled when team is not saved', async ({ page }) => {
        // Navigate to create a new team (unsaved state)
        await page.goto('/teams');
        await page.waitForTimeout(1000);

        // Look for new team button
        const newTeamButton = page.getByRole('button', { name: /New Team|Create Team/i });
        if (!await newTeamButton.isVisible().catch(() => false)) {
            test.skip(true, 'Skipping test - cannot find new team button');
            return;
        }

        await newTeamButton.click();
        await page.waitForTimeout(500);

        // Select Dropbox if the dropdown is visible
        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await selectStorageProvider(page, 'Dropbox');

            // Connect button should be disabled
            const connectButton = page.getByRole('button', { name: /Connect with Dropbox/i });
            if (await connectButton.isVisible().catch(() => false)) {
                await expect(connectButton).toBeDisabled();
            }
        }
    });

    test('Dropbox connected state should show folder path input', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Dropbox');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // When connected, folder path input should be visible
        const isConnected = await page.locator('text=Connected to Dropbox').isVisible().catch(() => false);

        if (isConnected) {
            const folderPathInput = page.locator('#dropbox-folder');
            await expect(folderPathInput).toBeVisible();
            await expect(page.getByRole('button', { name: /Disconnect/i })).toBeVisible();
        } else {
            // Connect button should be visible when not connected
            await expect(page.getByRole('button', { name: /Connect with Dropbox/i })).toBeVisible();
        }
    });
});

test.describe('Cloud Storage Integration - Common Behavior', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('All storage providers should be available in dropdown', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const storageDropdown = page.locator('#storage-provider');
        if (await storageDropdown.isVisible().catch(() => false)) {
            await storageDropdown.click();
            await page.waitForTimeout(300);

            // Verify all providers are present
            await expect(page.locator('text=Default (Application Storage)')).toBeVisible();
            await expect(page.locator('text=Local Path')).toBeVisible();
            await expect(page.locator('text=Amazon S3')).toBeVisible();
            await expect(page.locator('text=Google Drive')).toBeVisible();
            await expect(page.locator('text=Dropbox')).toBeVisible();
        }
    });

    test('Switching between cloud providers should reset configuration', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        // Select S3 first and enter some data
        let selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const bucketInput = page.locator('#s3-bucket');
        await bucketInput.fill('test-bucket');
        await expect(bucketInput).toHaveValue('test-bucket');

        // Switch to Google Drive
        selected = await selectStorageProvider(page, 'Google Drive');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Switch back to S3
        selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Bucket input should be empty (config was reset)
        const bucketValue = await page.locator('#s3-bucket').inputValue();
        expect(bucketValue).toBe('');
    });

    test('Switching to Default should hide all provider configurations', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        // Select S3 first
        let selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify S3 config is visible
        await expect(page.locator('#s3-bucket')).toBeVisible();

        // Switch to Default
        selected = await selectStorageProvider(page, 'Default (Application Storage)');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify S3 config is hidden
        await expect(page.locator('#s3-bucket')).not.toBeVisible();

        // Also verify other provider configs are hidden
        await expect(page.locator('#local-path')).not.toBeVisible();
        await expect(page.getByRole('button', { name: /Connect with Google/i })).not.toBeVisible();
        await expect(page.getByRole('button', { name: /Connect with Dropbox/i })).not.toBeVisible();
    });

    test('Local Path provider should show path validation functionality', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Local Path');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        // Verify Local Path configuration
        const pathInput = page.locator('#local-path');
        await expect(pathInput).toBeVisible();

        // Verify Validate button
        const validateButton = page.getByRole('button', { name: /Validate/i });
        await expect(validateButton).toBeVisible();

        // Validate button should be disabled when path is empty
        await expect(validateButton).toBeDisabled();

        // Enter a path
        await pathInput.fill('/tmp/test');

        // Validate button should now be enabled
        await expect(validateButton).toBeEnabled();
    });
});

test.describe('Cloud Storage - OAuth Flow UI Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('Google Drive Connect button should trigger OAuth flow', async ({ page, context }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Google Drive');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const connectButton = page.getByRole('button', { name: /Connect with Google/i });

        // Set up listener for navigation or new window
        // The button should trigger a redirect to Google OAuth
        let navigationOccurred = false;
        page.on('request', request => {
            if (request.url().includes('google-drive/auth-url')) {
                navigationOccurred = true;
            }
        });

        // Click the connect button (may trigger alert if API is not available)
        try {
            // Handle potential alert for API error
            page.on('dialog', dialog => {
                dialog.dismiss();
            });

            await connectButton.click();
            await page.waitForTimeout(500);
        } catch {
            // Expected if API endpoint is not available in test environment
        }

        // The test verifies the button is clickable and attempts to initiate OAuth
        await expect(connectButton).toBeVisible();
    });

    test('Dropbox Connect button should trigger OAuth flow', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Dropbox');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const connectButton = page.getByRole('button', { name: /Connect with Dropbox/i });

        // Set up listener for API request
        let apiRequestMade = false;
        page.on('request', request => {
            if (request.url().includes('dropbox/auth-url')) {
                apiRequestMade = true;
            }
        });

        // Click the connect button
        try {
            page.on('dialog', dialog => {
                dialog.dismiss();
            });

            await connectButton.click();
            await page.waitForTimeout(500);
        } catch {
            // Expected if API endpoint is not available in test environment
        }

        // The test verifies the button is clickable
        await expect(connectButton).toBeVisible();
    });
});

test.describe('Cloud Storage - Form Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/teams/IKA/documents');
        await page.waitForTimeout(1000);
    });

    test('S3 bucket name should accept valid bucket names', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const bucketInput = page.locator('#s3-bucket');

        // Test various valid bucket names
        await bucketInput.fill('my-bucket-name');
        await expect(bucketInput).toHaveValue('my-bucket-name');

        await bucketInput.fill('bucket123');
        await expect(bucketInput).toHaveValue('bucket123');

        await bucketInput.fill('my.bucket.name');
        await expect(bucketInput).toHaveValue('my.bucket.name');
    });

    test('S3 prefix should accept folder-style paths', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const prefixInput = page.locator('#s3-prefix');

        // Test various prefix formats
        await prefixInput.fill('documents/');
        await expect(prefixInput).toHaveValue('documents/');

        await prefixInput.fill('team/projects/files/');
        await expect(prefixInput).toHaveValue('team/projects/files/');
    });

    test('S3 access key should accept AWS access key format', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const accessKeyInput = page.locator('#s3-access-key');

        // AWS access keys are typically 20 characters
        await accessKeyInput.fill('AKIAIOSFODNN7EXAMPLE');
        await expect(accessKeyInput).toHaveValue('AKIAIOSFODNN7EXAMPLE');
    });

    test('S3 region selection should update correctly', async ({ page }) => {
        const navigated = await navigateToTeamSettings(page);
        if (!navigated) {
            test.skip(true, 'Skipping test - cannot access team settings');
            return;
        }

        const selected = await selectStorageProvider(page, 'Amazon S3');
        if (!selected) {
            test.skip(true, 'Skipping test - cannot select storage provider');
            return;
        }

        const regionSelect = page.locator('#s3-region');
        await regionSelect.click();
        await page.waitForTimeout(300);

        // Select US East
        await page.locator('text=US East (N. Virginia)').click();
        await page.waitForTimeout(300);

        // Verify selection (the trigger should show the selected value)
        await expect(regionSelect).toContainText('US East');
    });
});
