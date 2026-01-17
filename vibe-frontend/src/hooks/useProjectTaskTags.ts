import { useQueries } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import { useMemo } from 'react';
import type {
  Tag,
  TaskWithAttemptStatus,
  TaskTagWithDetails,
} from 'shared/types';

/**
 * Fetches tags for all tasks in a project and provides a map of taskId -> Tag[]
 * Uses parallel queries with TanStack Query for efficient batching
 */
export function useProjectTaskTags(tasks: TaskWithAttemptStatus[]) {
  // Only fetch tags for tasks that have IDs
  const taskIds = useMemo(
    () => tasks.map((t) => t.id).filter(Boolean),
    [tasks]
  );

  // Create parallel queries for each task's tags
  const tagQueries = useQueries({
    queries: taskIds.map((taskId) => ({
      queryKey: ['task-tags', taskId],
      queryFn: () => tasksApi.getTags(taskId),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    })),
  });

  // Build the task-tags map
  const taskTagsMap = useMemo(() => {
    const map = new Map<string, Tag[]>();

    tagQueries.forEach((query, index) => {
      const taskId = taskIds[index];
      if (query.data && taskId) {
        // Convert TaskTagWithDetails to Tag format
        const tags: Tag[] = query.data.map((ttd: TaskTagWithDetails) => ({
          id: ttd.tag_id,
          tag_name: ttd.tag_name,
          content: ttd.content,
          color: ttd.color,
          team_id: null, // TaskTagWithDetails doesn't include team_id
          created_at: ttd.created_at,
          updated_at: ttd.created_at, // Use created_at as fallback
        }));
        map.set(taskId, tags);
      }
    });

    return map;
  }, [tagQueries, taskIds]);

  // Compute loading state
  const isLoading = tagQueries.some((q) => q.isLoading);
  const isFetching = tagQueries.some((q) => q.isFetching);

  // Get all unique tags across all tasks
  const allTags = useMemo(() => {
    const tagMap = new Map<string, Tag>();
    taskTagsMap.forEach((tags) => {
      tags.forEach((tag) => {
        if (!tagMap.has(tag.id)) {
          tagMap.set(tag.id, tag);
        }
      });
    });
    return Array.from(tagMap.values());
  }, [taskTagsMap]);

  return {
    taskTagsMap,
    allTags,
    isLoading,
    isFetching,
  };
}
