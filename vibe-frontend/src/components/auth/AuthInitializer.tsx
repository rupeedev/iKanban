import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthTokenGetter } from '@/lib/api';
import { clearPersistedCache } from '@/lib/indexedDBPersister';

/**
 * AuthInitializer sets up the API auth token getter using Clerk's getToken.
 * This component should be rendered inside the ClerkProvider.
 * It doesn't render anything visible.
 */
export function AuthInitializer() {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  // Track previous sign-in state to detect sign-out
  const wasSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    // Don't set up token getter until Clerk is fully loaded
    // This prevents setting a null getter during initial load
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      // Set up the token getter for the API module
      setAuthTokenGetter(async () => {
        try {
          const token = await getToken();
          if (!token) {
            console.warn(
              'Clerk getToken() returned null - user may need to re-authenticate'
            );
          }
          return token;
        } catch (e) {
          console.warn('Failed to get Clerk token:', e);
          return null;
        }
      });
      wasSignedInRef.current = true;
    } else {
      // Clear the token getter when signed out
      setAuthTokenGetter(async () => null);

      // Security: Clear all cached data on logout to prevent sensitive data exposure
      // Only clear if the user was previously signed in (not on initial load)
      if (wasSignedInRef.current === true) {
        // Clear TanStack Query in-memory cache
        queryClient.clear();
        // Clear IndexedDB persisted cache
        clearPersistedCache().catch((err) =>
          console.warn('Failed to clear persisted cache on logout:', err)
        );
      }
      wasSignedInRef.current = false;
    }
  }, [getToken, isSignedIn, isLoaded, queryClient]);

  return null;
}
