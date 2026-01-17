import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IKA-115: Fix GitHub OAuth 404 error
 *
 * Root cause: In production, the frontend uses window.location.origin to build
 * the OAuth URL, which returns https://app.scho1ar.com, but the API is at
 * https://api.scho1ar.com. Since window.open() bypasses Vercel proxy rewrites,
 * it goes directly to the app domain which returns 404.
 *
 * The fix should use VITE_API_URL (when set) for the OAuth URL instead of
 * window.location.origin.
 */

test.describe('IKA-115: GitHub OAuth URL Construction', () => {
  test('should use VITE_API_URL for OAuth URL construction in ProjectSettings', async () => {
    // This test verifies that the code uses VITE_API_URL instead of window.location.origin
    // by examining the source code directly (code verification test)

    const projectSettingsPath = path.join(
      __dirname,
      '../../vibe-frontend/src/pages/Settings/ProjectSettings.tsx'
    );

    // Read the source file
    const sourceCode = fs.readFileSync(projectSettingsPath, 'utf-8');

    // Verify the fix is in place:
    // 1. Should use import.meta.env.VITE_API_URL
    expect(sourceCode).toContain('import.meta.env.VITE_API_URL');

    // 2. Should have the correct pattern for apiBaseUrl with fallback
    expect(sourceCode).toContain(
      'import.meta.env.VITE_API_URL || window.location.origin'
    );

    // 3. The OAuth URL should use apiBaseUrl variable
    expect(sourceCode).toContain('`${apiBaseUrl}/api/oauth/github/authorize');

    // 4. Should NOT have the old broken pattern where backendUrl uses only window.location.origin
    // (The old code was: const backendUrl = window.location.origin; followed by ${backendUrl}/api/oauth)
    expect(sourceCode).not.toMatch(
      /const\s+backendUrl\s*=\s*window\.location\.origin\s*;?\s*[\s\S]*?\$\{backendUrl\}\/api\/oauth/
    );
  });

  test('should have correct OAuth URL format with callback_url parameter', async () => {
    // Verify the OAuth URL includes the callback_url parameter

    const projectSettingsPath = path.join(
      __dirname,
      '../../vibe-frontend/src/pages/Settings/ProjectSettings.tsx'
    );

    const sourceCode = fs.readFileSync(projectSettingsPath, 'utf-8');

    // The OAuth URL should include callback_url parameter
    expect(sourceCode).toContain('callback_url=');
    expect(sourceCode).toContain('/settings/github-callback');

    // The callback URL should still use window.location.origin (for the callback destination)
    // since the callback needs to come back to the app domain
    expect(sourceCode).toContain(
      "encodeURIComponent(window.location.origin + '/settings/github-callback')"
    );
  });

  test('should have explanatory comment for the VITE_API_URL usage', async () => {
    // Verify that the code has comments explaining why VITE_API_URL is needed

    const projectSettingsPath = path.join(
      __dirname,
      '../../vibe-frontend/src/pages/Settings/ProjectSettings.tsx'
    );

    const sourceCode = fs.readFileSync(projectSettingsPath, 'utf-8');

    // Should have a comment explaining the production domain issue
    expect(sourceCode).toContain('VITE_API_URL');
    expect(sourceCode.toLowerCase()).toContain('production');

    // Should mention that window.open bypasses proxy rewrites
    expect(sourceCode.toLowerCase()).toContain('proxy');
  });
});
