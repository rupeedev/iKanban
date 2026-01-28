import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tasksApi, RequestTimeoutError } from '@/lib/api';
import { TaskTagWithDetails } from 'shared/types';

export function useTaskTags(taskId: string | undefined) {
  const queryClient = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ['task-tags', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return tasksApi.getTags(taskId);
    },
    enabled: !!taskId,
    // Cache tags for 5 minutes to reduce API calls
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 15 minutes
    gcTime: 15 * 60 * 1000,
    // Global defaults in main.tsx handle rate limiting and refetch behavior
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!taskId) throw new Error('Task ID required');
      return tasksApi.addTag(taskId, tagId);
    },
    onSuccess: () => {
      // Invalidate to fetch fresh data with tag details - don't force refetch
      queryClient.invalidateQueries({
        queryKey: ['task-tags', taskId],
        refetchType: 'none',
      });
    },
    onError: (error) => {
      console.error('[useTaskTags] Add tag failed:', error);
      if (error instanceof RequestTimeoutError) {
        toast.error('Request timed out', {
          description: 'Failed to add label. Please try again.',
        });
      } else {
        toast.error('Failed to add label');
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!taskId) throw new Error('Task ID required');
      return tasksApi.removeTag(taskId, tagId);
    },
    onSuccess: (_, tagId) => {
      queryClient.setQueryData<TaskTagWithDetails[]>(
        ['task-tags', taskId],
        (old) => old?.filter((t) => t.tag_id !== tagId) ?? []
      );
    },
    onError: (error) => {
      console.error('[useTaskTags] Remove tag failed:', error);
      if (error instanceof RequestTimeoutError) {
        toast.error('Request timed out', {
          description: 'Failed to remove label. Please try again.',
        });
      } else {
        toast.error('Failed to remove label');
      }
      // Mark cache stale to restore correct state on next access
      queryClient.invalidateQueries({
        queryKey: ['task-tags', taskId],
        refetchType: 'none',
      });
    },
  });

  return {
    tags: tagsQuery.data ?? [],
    isLoading: tagsQuery.isLoading,
    isFetching: tagsQuery.isFetching,
    error: tagsQuery.error,
    refetch: tagsQuery.refetch,
    addTag: addTagMutation.mutateAsync,
    removeTag: removeTagMutation.mutateAsync,
    isAdding: addTagMutation.isPending,
    isRemoving: removeTagMutation.isPending,
  };
}
