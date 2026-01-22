import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Loader } from '@/components/ui/loader';
import { useUserRegistration } from '@/hooks/useUserRegistration';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Check if Clerk is configured (evaluated once at module load)
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Wraps routes that require authentication and registration approval.
 * Flow:
 * 1. Check Clerk authentication
 * 2. Check registration status
 * 3. Redirect based on status:
 *    - Not signed in → /about
 *    - No registration → /register
 *    - Pending → /pending-approval
 *    - Rejected → /rejected
 *    - Approved → render children
 * - If Clerk is not configured: allows access (local dev mode)
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // If Clerk is not enabled, allow access without auth check
  if (!CLERK_ENABLED) {
    return <>{children}</>;
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}

/**
 * Internal component that uses Clerk hooks (only rendered when Clerk is enabled)
 */
function ClerkProtectedRoute({ children }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const {
    isLoading: isRegistrationLoading,
    hasRegistration,
    isApproved,
    isPending,
    isRejected,
    error: registrationError,
  } = useUserRegistration();

  // Show loader while Clerk is loading
  if (!isUserLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  // If user is not signed in, redirect to about page
  if (!isSignedIn) {
    return <Navigate to="/about" replace />;
  }

  // Show loader while checking registration status
  if (isRegistrationLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Checking registration..." size={32} />
      </div>
    );
  }

  // Show error if registration status fetch failed
  if (registrationError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load registration status</p>
        <p className="text-sm text-muted-foreground">
          {registrationError.message}
        </p>
      </div>
    );
  }

  // No registration found → redirect to register page
  if (!hasRegistration) {
    return <Navigate to="/register" replace />;
  }

  // Registration pending → redirect to pending page
  if (isPending) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Registration rejected → redirect to rejected page
  if (isRejected) {
    return <Navigate to="/rejected" replace />;
  }

  // Registration approved → render protected content
  if (isApproved) {
    return <>{children}</>;
  }

  // Fallback for any unexpected state - redirect to register
  return <Navigate to="/register" replace />;
}
