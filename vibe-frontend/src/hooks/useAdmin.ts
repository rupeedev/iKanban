import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  AdminStats,
  AdminActivity,
  AdminUser,
  AdminInvitation,
  AdminPermission,
  AdminFeatureToggle,
  AdminConfiguration,
  CreateInvitationRequest,
} from '@/lib/api';

// Query keys factory
export const adminKeys = {
  all: ['admin'] as const,
  stats: (workspaceId: string) => [...adminKeys.all, 'stats', workspaceId] as const,
  activity: (workspaceId: string) => [...adminKeys.all, 'activity', workspaceId] as const,
  users: (workspaceId: string) => [...adminKeys.all, 'users', workspaceId] as const,
  invitations: (workspaceId: string) => [...adminKeys.all, 'invitations', workspaceId] as const,
  permissions: (workspaceId: string) => [...adminKeys.all, 'permissions', workspaceId] as const,
  features: (workspaceId: string) => [...adminKeys.all, 'features', workspaceId] as const,
  configuration: (workspaceId: string) => [...adminKeys.all, 'configuration', workspaceId] as const,
};

// Check if error is rate limit
function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('429');
}

// =============================================================================
// Dashboard Hooks
// =============================================================================

export function useAdminStats(workspaceId: string | undefined) {
  return useQuery<AdminStats>({
    queryKey: adminKeys.stats(workspaceId ?? ''),
    queryFn: () => adminApi.getStats(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminActivity(workspaceId: string | undefined) {
  return useQuery<AdminActivity[]>({
    queryKey: adminKeys.activity(workspaceId ?? ''),
    queryFn: () => adminApi.getActivity(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

// =============================================================================
// Users Hooks
// =============================================================================

export function useAdminUsers(workspaceId: string | undefined) {
  return useQuery<AdminUser[]>({
    queryKey: adminKeys.users(workspaceId ?? ''),
    queryFn: () => adminApi.listUsers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminUserMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      adminApi.updateUserStatus(workspaceId!, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users(workspaceId ?? '') });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats(workspaceId ?? '') });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.updateUserRole(workspaceId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users(workspaceId ?? '') });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) => adminApi.removeUser(workspaceId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users(workspaceId ?? '') });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats(workspaceId ?? '') });
    },
  });

  return {
    updateStatus: (userId: string, status: string) =>
      updateStatusMutation.mutateAsync({ userId, status }),
    updateRole: (userId: string, role: string) =>
      updateRoleMutation.mutateAsync({ userId, role }),
    removeUser: (userId: string) => removeUserMutation.mutateAsync(userId),
    isUpdatingStatus: updateStatusMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemoving: removeUserMutation.isPending,
  };
}

// =============================================================================
// Invitations Hooks
// =============================================================================

export function useAdminInvitations(workspaceId: string | undefined) {
  return useQuery<AdminInvitation[]>({
    queryKey: adminKeys.invitations(workspaceId ?? ''),
    queryFn: () => adminApi.listInvitations(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminInvitationMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: CreateInvitationRequest) =>
      adminApi.createInvitation(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations(workspaceId ?? '') });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats(workspaceId ?? '') });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) =>
      adminApi.resendInvitation(workspaceId!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations(workspaceId ?? '') });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      adminApi.revokeInvitation(workspaceId!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations(workspaceId ?? '') });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats(workspaceId ?? '') });
    },
  });

  return {
    createInvitation: (data: CreateInvitationRequest) => createMutation.mutateAsync(data),
    resendInvitation: (invitationId: string) => resendMutation.mutateAsync(invitationId),
    revokeInvitation: (invitationId: string) => revokeMutation.mutateAsync(invitationId),
    isCreating: createMutation.isPending,
    isResending: resendMutation.isPending,
    isRevoking: revokeMutation.isPending,
  };
}

// =============================================================================
// Permissions Hooks
// =============================================================================

export function useAdminPermissions(workspaceId: string | undefined) {
  return useQuery<AdminPermission[]>({
    queryKey: adminKeys.permissions(workspaceId ?? ''),
    queryFn: () => adminApi.getPermissions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000, // 10 minutes - permissions don't change often
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminFeatures(workspaceId: string | undefined) {
  return useQuery<AdminFeatureToggle[]>({
    queryKey: adminKeys.features(workspaceId ?? ''),
    queryFn: () => adminApi.getFeatures(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminPermissionMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  const updatePermissionMutation = useMutation({
    mutationFn: ({ permissionId, role, enabled }: { permissionId: string; role: string; enabled: boolean }) =>
      adminApi.updatePermission(workspaceId!, permissionId, role, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.permissions(workspaceId ?? '') });
    },
  });

  const updateFeatureMutation = useMutation({
    mutationFn: ({ featureId, enabled }: { featureId: string; enabled: boolean }) =>
      adminApi.updateFeature(workspaceId!, featureId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.features(workspaceId ?? '') });
    },
  });

  return {
    updatePermission: (permissionId: string, role: string, enabled: boolean) =>
      updatePermissionMutation.mutateAsync({ permissionId, role, enabled }),
    updateFeature: (featureId: string, enabled: boolean) =>
      updateFeatureMutation.mutateAsync({ featureId, enabled }),
    isUpdatingPermission: updatePermissionMutation.isPending,
    isUpdatingFeature: updateFeatureMutation.isPending,
  };
}

// =============================================================================
// Configuration Hooks
// =============================================================================

export function useAdminConfiguration(workspaceId: string | undefined) {
  return useQuery<AdminConfiguration>({
    queryKey: adminKeys.configuration(workspaceId ?? ''),
    queryFn: () => adminApi.getConfiguration(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}

export function useAdminConfigurationMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (config: AdminConfiguration) =>
      adminApi.updateConfiguration(workspaceId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.configuration(workspaceId ?? '') });
    },
  });

  return {
    updateConfiguration: (config: AdminConfiguration) => updateMutation.mutateAsync(config),
    isUpdating: updateMutation.isPending,
  };
}
