import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/loader';
import { superadminApi, tenantWorkspacesApi } from '@/lib/api';

// Check if Clerk is configured (evaluated once at module load)
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Landing redirect component - determines where to send users after sign-in.
 * Priority:
 * 1. Superadmin → /superadmin/registrations
 * 2. Workspace Admin/Owner → /admin
 * 3. Regular user → /my-issues
 */
export function LandingRedirect() {
  // If Clerk is not enabled, default to /my-issues (dev mode)
  if (!CLERK_ENABLED) {
    return <Navigate to="/my-issues" replace />;
  }

  return <ClerkLandingRedirect />;
}

/**
 * Internal component that uses Clerk hooks (only rendered when Clerk is enabled)
 */
function ClerkLandingRedirect() {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const userId = user?.id;

  // Check superadmin status
  const {
    data: superadminCheck,
    isLoading: isCheckingSuperadmin,
  } = useQuery({
    queryKey: ['superadmin', 'check'],
    queryFn: () => superadminApi.check(),
    enabled: isClerkLoaded && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 403 (expected for non-superadmins)
      if (error && 'status' in error && error.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Check workspace membership to determine if user is admin/owner
  const {
    data: workspaces = [],
    isLoading: isLoadingWorkspaces,
  } = useQuery({
    queryKey: ['tenant-workspaces', userId],
    queryFn: () => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.list(userId);
    },
    enabled: isClerkLoaded && !!userId && !superadminCheck?.is_superadmin,
    staleTime: 5 * 60 * 1000,
  });

  // Get user's role in their workspaces
  const {
    data: members = [],
    isLoading: isLoadingMembers,
  } = useQuery({
    queryKey: ['workspace-members-role-check', userId],
    queryFn: async () => {
      if (!userId || workspaces.length === 0) return [];
      // Get members from the first workspace to check user's role
      const firstWorkspace = workspaces[0];
      return tenantWorkspacesApi.getMembers(firstWorkspace.id, userId);
    },
    enabled:
      isClerkLoaded &&
      !!userId &&
      !superadminCheck?.is_superadmin &&
      workspaces.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Show loader while checking
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
  if (isCheckingSuperadmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Checking access..." size={32} />
      </div>
    );
  }

  // If user is superadmin, redirect to superadmin registrations
  if (superadminCheck?.is_superadmin) {
    return <Navigate to="/superadmin/registrations" replace />;
  }

  // Show loader while checking workspace role
  if (isLoadingWorkspaces || isLoadingMembers) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading workspace..." size={32} />
      </div>
    );
  }

  // Check if user is admin or owner in any workspace
  const userEmail = user.primaryEmailAddress?.emailAddress;
  const userMember = members.find(
    (m: typeof members[0]) => m.user_id === userId || m.email === userEmail
  );
  const isAdminOrOwner =
    userMember?.role === 'admin' || userMember?.role === 'owner';

  // If user is admin/owner, redirect to admin panel
  if (isAdminOrOwner) {
    return <Navigate to="/admin" replace />;
  }

  // Default: redirect to my-issues
  return <Navigate to="/my-issues" replace />;
}
