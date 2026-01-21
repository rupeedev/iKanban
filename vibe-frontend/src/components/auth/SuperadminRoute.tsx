import { Navigate, Outlet } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Loader } from '@/components/ui/loader';

// Superadmin emails - app owners who can access /superadmin/* routes
// TODO: Replace with API call to GET /api/superadmin/check when backend is ready
const SUPERADMIN_EMAILS = ['rupesh@scho1ar.com', 'rupeshpanwar43@gmail.com'];

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
  const { user, isLoaded } = useUser();

  // Show loader while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Checking access..." size={32} />
      </div>
    );
  }

  // If user is not signed in, redirect to about page
  if (!user) {
    return <Navigate to="/about" replace />;
  }

  // Check if user is a superadmin by email
  const userEmail = user.primaryEmailAddress?.emailAddress;
  const isSuperadmin = userEmail && SUPERADMIN_EMAILS.includes(userEmail);

  if (!isSuperadmin) {
    // Not a superadmin - redirect to home with a message
    // TODO: Could show a toast notification here
    return <Navigate to="/" replace />;
  }

  // User is a superadmin, render the protected content
  return <Outlet />;
}
