import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { TaskTagWithDetails } from "shared/types";

export function useTaskTags(taskId: string | undefined) {
  const queryClient = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ["task-tags", taskId],
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
      if (!taskId) throw new Error("Task ID required");
      return tasksApi.addTag(taskId, tagId);
    },
    onMutate: async (tagId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["task-tags", taskId] });

      // Snapshot the previous value
      const previousTags = queryClient.getQueryData<TaskTagWithDetails[]>(["task-tags", taskId]);

      // Optimistically update - get tag details from tags cache
      const allTags = queryClient.getQueryData<Array<{ id: string; tag_name: string; content?: string; color?: string | null }>>(["tags"]) || [];
      const tag = allTags.find((t) => t.id === tagId);
      
      if (tag && previousTags) {
        const optimisticTag: TaskTagWithDetails = {
          id: crypto.randomUUID(), // Temporary ID
          tag_id: tagId,
          tag_name: tag.tag_name,
          content: tag.content || '',
          color: tag.color,
          created_at: new Date().toISOString(),
        };
        
        queryClient.setQueryData<TaskTagWithDetails[]>(
          ["task-tags", taskId],
          [...previousTags, optimisticTag]
        );
      }

      return { previousTags };
    },
    onError: (_err, _tagId, context) => {
      // Rollback on error
      if (context?.previousTags) {
        queryClient.setQueryData(["task-tags", taskId], context.previousTags);
      }
    },
    onSuccess: () => {
      // Invalidate to fetch fresh data with correct IDs
      queryClient.invalidateQueries({ queryKey: ["task-tags", taskId] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!taskId) throw new Error("Task ID required");
      return tasksApi.removeTag(taskId, tagId);
    },
    onSuccess: (_, tagId) => {
      queryClient.setQueryData<TaskTagWithDetails[]>(
        ["task-tags", taskId],
        (old) => old?.filter((t) => t.tag_id !== tagId) ?? []
      );
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
