/**
 * Combined hook for fetching task details (comments, links, tags) in one request.
 * Performance optimization: reduces 3 API calls to 1, with single access check on backend.
 *
 * IKA-342: Optimize Issue Detail Panel Loading
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type {
  TaskComment,
  LinkedDocument,
  TaskTagWithDetails,
} from 'shared/types';

// Helper to detect rate limit errors
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

// Query keys for individual caches (kept for backwards compatibility with existing hooks)
// These MUST match the query keys used in useTaskComments, useTaskDocumentLinks, useTaskTags
export const taskDetailsKeys = {
  details: (taskId: string) => ['task-details', taskId] as const,
  comments: (taskId: string) => ['task-comments', taskId] as const,
  links: (taskId: string) => ['task-document-links', taskId] as const, // matches useTaskDocumentLinks
  tags: (taskId: string) => ['task-tags', taskId] as const, // matches useTaskTags
};

export interface TaskDetails {
  comments: TaskComment[];
  links: LinkedDocument[];
  tags: TaskTagWithDetails[];
}

/**
 * Fetches all task details in a single API call and populates individual caches.
 * Use this when opening the issue detail panel to avoid multiple sequential requests.
 */
export function useTaskDetails(taskId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<TaskDetails>({
    queryKey: taskDetailsKeys.details(taskId || ''),
    queryFn: async () => {
      if (!taskId) return { comments: [], links: [], tags: [] };
      try {
        const details = await tasksApi.getDetails(taskId);

        // Populate individual query caches for backwards compatibility
        // This allows other components using useTaskComments, useTaskDocumentLinks, useTaskTags
        // to immediately have data without making additional requests
        queryClient.setQueryData(
          taskDetailsKeys.comments(taskId),
          details.comments
        );
        queryClient.setQueryData(taskDetailsKeys.links(taskId), details.links);
        queryClient.setQueryData(taskDetailsKeys.tags(taskId), details.tags);

        return details;
      } catch (error) {
        console.error('[useTaskDetails] Failed to fetch task details:', error);
        throw error;
      }
    },
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  });

  return {
    comments: query.data?.comments ?? [],
    links: query.data?.links ?? [],
    tags: query.data?.tags ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Prefetch task details without rendering.
 * Use this on hover to warm up the cache before opening the detail panel.
 */
export function usePrefetchTaskDetails() {
  const queryClient = useQueryClient();

  return async (taskId: string) => {
    await queryClient.prefetchQuery({
      queryKey: taskDetailsKeys.details(taskId),
      queryFn: async () => {
        const details = await tasksApi.getDetails(taskId);

        // Populate individual caches
        queryClient.setQueryData(
          taskDetailsKeys.comments(taskId),
          details.comments
        );
        queryClient.setQueryData(taskDetailsKeys.links(taskId), details.links);
        queryClient.setQueryData(taskDetailsKeys.tags(taskId), details.tags);

        return details;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
}
