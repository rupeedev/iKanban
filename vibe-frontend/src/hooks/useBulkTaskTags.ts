import { useQueries } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { TaskTagWithDetails } from 'shared/types';

/**
 * Hook to fetch tags for multiple tasks in parallel.
 * Uses TanStack Query's useQueries for efficient parallel fetching with caching.
 *
 * @param taskIds - Array of task IDs to fetch tags for
 * @returns Object containing tagsMap, isLoading, and isError states
 */
export function useBulkTaskTags(taskIds: string[]) {
  // Use useQueries for parallel fetching with individual caching per task
  const results = useQueries({
    queries: taskIds.map((taskId) => ({
      queryKey: ['task-tags', taskId],
      queryFn: () => tasksApi.getTags(taskId),
      // Cache tags for 5 minutes to reduce API calls
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 15 minutes
      gcTime: 15 * 60 * 1000,
      enabled: !!taskId,
    })),
  });

  // Calculate loading and error states
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  // Build map of taskId -> tags
  const tagsMap = new Map<string, TaskTagWithDetails[]>();
  taskIds.forEach((taskId, index) => {
    const result = results[index];
    tagsMap.set(taskId, result?.data ?? []);
  });

  return { tagsMap, isLoading, isError };
}
