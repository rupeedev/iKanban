import { Navigate, Outlet } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/loader';
import { superadminApi } from '@/lib/api';

// Check if Clerk is configured (evaluated once at module load)
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Protects superadmin routes - only app owners can access.
 * Different from admin routes (workspace admins) - this is for the app owner only.
 *
 * - If user is a superadmin: renders children/outlet
 * - If user is not a superadmin: redirects to home
 * - While loading: shows loading spinner
 * - If Clerk is not configured: allows access (local dev mode)
 */
export function SuperadminRoute() {
  // If Clerk is not enabled, allow access without auth check (dev mode)
  if (!CLERK_ENABLED) {
    return <Outlet />;
  }

  return <ClerkSuperadminRoute />;
}

/**
 * Internal component that uses Clerk hooks (only rendered when Clerk is enabled)
 */
function ClerkSuperadminRoute() {
  const { user, isLoaded: isClerkLoaded } = useUser();

  // Query superadmin status from backend API (IKA-210)
  const {
    data: superadminCheck,
    isLoading: isCheckingAccess,
    isError,
  } = useQuery({
    queryKey: ['superadmin', 'check'],
    queryFn: () => superadminApi.check(),
    // Only run query if user is signed in
    enabled: isClerkLoaded && !!user,
    // Cache for 5 minutes - superadmin status rarely changes
    staleTime: 5 * 60 * 1000,
    // Don't retry on 403 (expected for non-superadmins)
    retry: (failureCount, error) => {
      if (error && 'status' in error && error.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Show loader while Clerk is loading
  if (!isClerkLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  // If user is not signed in, redirect to about page
  if (!user) {
    return <Navigate to="/about" replace />;
  }

  // Show loader while checking superadmin status
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Checking access..." size={32} />
      </div>
    );
  }

  // If API call failed or user is not a superadmin, redirect to home
  if (isError || !superadminCheck?.is_superadmin) {
    return <Navigate to="/" replace />;
  }

  // User is a superadmin, render the protected content
  return <Outlet />;
}
