import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pulseApi, subscriptionsApi } from '@/lib/api';
import type {
  ProjectUpdate,
  CreateProjectUpdate,
  UpdateProjectUpdate,
  PulseFilter,
  SubscriptionSettings,
  DigestFrequency,
} from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );
  }
  return false;
}

// Query keys for consistent caching
export const pulseKeys = {
  all: ['pulse'] as const,
  list: (filter: PulseFilter) => [...pulseKeys.all, 'list', filter] as const,
  project: (projectId: string) =>
    [...pulseKeys.all, 'project', projectId] as const,
  detail: (updateId: string) => [...pulseKeys.all, 'detail', updateId] as const,
  subscriptions: () => [...pulseKeys.all, 'subscriptions'] as const,
};

export interface UsePulseResult {
  updates: ProjectUpdate[];
  isLoading: boolean;
  error: Error | null;
  filter: PulseFilter;
  setFilter: (filter: PulseFilter) => void;
  refresh: () => Promise<void>;
  createUpdate: (
    projectId: string,
    data: CreateProjectUpdate
  ) => Promise<ProjectUpdate>;
  updateUpdate: (
    updateId: string,
    data: UpdateProjectUpdate
  ) => Promise<ProjectUpdate>;
  deleteUpdate: (updateId: string) => Promise<void>;
  addReaction: (updateId: string, emoji: string) => Promise<void>;
  removeReaction: (updateId: string, emoji: string) => Promise<void>;
}

export interface UseSubscriptionsResult {
  settings: SubscriptionSettings | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateGlobalFrequency: (frequency: DigestFrequency) => Promise<void>;
  subscribeToProject: (projectId: string) => Promise<void>;
  unsubscribeFromProject: (projectId: string) => Promise<void>;
}

/**
 * Hook for managing Pulse (Activity) feed with TanStack Query.
 */
export function usePulse(
  initialFilter: PulseFilter = 'recent'
): UsePulseResult {
  const queryClient = useQueryClient();

  // Query for updates list
  const {
    data: updates = [],
    isLoading,
    error: updatesError,
  } = useQuery<ProjectUpdate[]>({
    queryKey: pulseKeys.list(initialFilter),
    queryFn: () => pulseApi.list(initialFilter),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: pulseKeys.list(initialFilter),
      refetchType: 'none',
    });
  }, [queryClient, initialFilter]);

  const setFilter = useCallback(
    (newFilter: PulseFilter) => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.list(newFilter),
      });
    },
    [queryClient]
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateProjectUpdate;
    }) => pulseApi.create(projectId, data),
    onSuccess: (newUpdate) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        pulseKeys.list(initialFilter),
        (old) => (old ? [newUpdate, ...old] : [newUpdate])
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      updateId,
      data,
    }: {
      updateId: string;
      data: UpdateProjectUpdate;
    }) => pulseApi.update(updateId, data),
    onSuccess: (updatedUpdate) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        pulseKeys.list(initialFilter),
        (old) =>
          old?.map((item) =>
            item.id === updatedUpdate.id ? updatedUpdate : item
          ) ?? []
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (updateId: string) => pulseApi.delete(updateId),
    onSuccess: (_, updateId) => {
      queryClient.setQueryData<ProjectUpdate[]>(
        pulseKeys.list(initialFilter),
        (old) => old?.filter((item) => item.id !== updateId) ?? []
      );
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: ({ updateId, emoji }: { updateId: string; emoji: string }) =>
      pulseApi.addReaction(updateId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.all,
      });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: ({ updateId, emoji }: { updateId: string; emoji: string }) =>
      pulseApi.removeReaction(updateId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.all,
      });
    },
  });

  const createUpdate = useCallback(
    async (projectId: string, data: CreateProjectUpdate) =>
      createMutation.mutateAsync({ projectId, data }),
    [createMutation]
  );

  const updateUpdate = useCallback(
    async (updateId: string, data: UpdateProjectUpdate) =>
      updateMutation.mutateAsync({ updateId, data }),
    [updateMutation]
  );

  const deleteUpdate = useCallback(
    async (updateId: string) => {
      await deleteMutation.mutateAsync(updateId);
    },
    [deleteMutation]
  );

  const addReaction = useCallback(
    async (updateId: string, emoji: string) => {
      await addReactionMutation.mutateAsync({ updateId, emoji });
    },
    [addReactionMutation]
  );

  const removeReaction = useCallback(
    async (updateId: string, emoji: string) => {
      await removeReactionMutation.mutateAsync({ updateId, emoji });
    },
    [removeReactionMutation]
  );

  return {
    updates,
    isLoading,
    error: updatesError
      ? updatesError instanceof Error
        ? updatesError
        : new Error('Failed to fetch pulse updates')
      : null,
    filter: initialFilter,
    setFilter,
    refresh,
    createUpdate,
    updateUpdate,
    deleteUpdate,
    addReaction,
    removeReaction,
  };
}

/**
 * Hook for managing user subscriptions with TanStack Query.
 */
export function useSubscriptions(): UseSubscriptionsResult {
  const queryClient = useQueryClient();

  const {
    data: settings = null,
    isLoading,
    error: settingsError,
  } = useQuery<SubscriptionSettings>({
    queryKey: pulseKeys.subscriptions(),
    queryFn: () => subscriptionsApi.getSettings(),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: pulseKeys.subscriptions(),
      refetchType: 'none',
    });
  }, [queryClient]);

  const updateGlobalMutation = useMutation({
    mutationFn: (frequency: DigestFrequency) =>
      subscriptionsApi.updateGlobalSettings(frequency),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.subscriptions(),
      });
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (projectId: string) =>
      subscriptionsApi.subscribeToProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.subscriptions(),
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: (projectId: string) =>
      subscriptionsApi.unsubscribeFromProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pulseKeys.subscriptions(),
      });
    },
  });

  const updateGlobalFrequency = useCallback(
    async (frequency: DigestFrequency) => {
      await updateGlobalMutation.mutateAsync(frequency);
    },
    [updateGlobalMutation]
  );

  const subscribeToProject = useCallback(
    async (projectId: string) => {
      await subscribeMutation.mutateAsync(projectId);
    },
    [subscribeMutation]
  );

  const unsubscribeFromProject = useCallback(
    async (projectId: string) => {
      await unsubscribeMutation.mutateAsync(projectId);
    },
    [unsubscribeMutation]
  );

  return {
    settings,
    isLoading,
    error: settingsError
      ? settingsError instanceof Error
        ? settingsError
        : new Error('Failed to fetch subscription settings')
      : null,
    refresh,
    updateGlobalFrequency,
    subscribeToProject,
    unsubscribeFromProject,
  };
}
