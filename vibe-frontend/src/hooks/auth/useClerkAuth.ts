/**
 * Wrapper hooks for Clerk's useAuth/useUser that work safely when Clerk is not configured.
 *
 * When VITE_CLERK_PUBLISHABLE_KEY is not set, the app renders without ClerkProvider,
 * and calling Clerk hooks directly would crash.
 *
 * STRATEGY: We use separate hook implementations that are conditionally exported.
 * When Clerk is not configured, we export stub hooks that return noop values.
 * When Clerk is configured, we export wrapper hooks that call Clerk's hooks.
 * This avoids conditional hook calls within a single function.
 */

import * as ClerkReact from '@clerk/clerk-react';

// Check if Clerk is configured at module level
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const hasClerk = !!CLERK_PUBLISHABLE_KEY;

// Define the return type to match what our hooks need from Clerk's useAuth
export interface ClerkAuthReturn {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
}

// Stub implementation for when Clerk is not configured
const noopClerkAuth: ClerkAuthReturn = {
  getToken: async () => null,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
};

// Define the return type for useClerkUser (subset of Clerk's useUser return)
export interface ClerkUserReturn {
  user: {
    id: string;
    primaryEmailAddress?: { emailAddress: string } | null;
    fullName: string | null;
    firstName: string | null;
    imageUrl: string | null;
  } | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

// Stub for when Clerk is not configured
const noopClerkUser: ClerkUserReturn = {
  user: null,
  isLoaded: true,
  isSignedIn: false,
};

// Stub hooks for when Clerk is not configured
function useClerkAuthStub(): ClerkAuthReturn {
  return noopClerkAuth;
}

function useClerkUserStub(): ClerkUserReturn {
  return noopClerkUser;
}

// Real implementation hooks that call Clerk's hooks
function useClerkAuthReal(): ClerkAuthReturn {
  const auth = ClerkReact.useAuth();
  return {
    getToken: auth.getToken,
    isLoaded: auth.isLoaded ?? true,
    isSignedIn: !!auth.isSignedIn,
    userId: auth.userId ?? null,
  };
}

function useClerkUserReal(): ClerkUserReturn {
  const { user, isLoaded, isSignedIn } = ClerkReact.useUser();
  return {
    user: user
      ? {
          id: user.id,
          primaryEmailAddress: user.primaryEmailAddress,
          fullName: user.fullName,
          firstName: user.firstName,
          imageUrl: user.imageUrl,
        }
      : null,
    isLoaded: isLoaded ?? true,
    isSignedIn: !!isSignedIn,
  };
}

/**
 * Safe wrapper for Clerk's useAuth hook.
 *
 * Use this instead of importing useAuth directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export const useClerkAuth = hasClerk ? useClerkAuthReal : useClerkAuthStub;

/**
 * Safe wrapper for Clerk's useUser hook.
 *
 * Use this instead of importing useUser directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export const useClerkUser = hasClerk ? useClerkUserReal : useClerkUserStub;
