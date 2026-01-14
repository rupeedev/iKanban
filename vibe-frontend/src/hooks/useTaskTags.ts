import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { TaskTagWithDetails } from "shared/types";

// Helper to detect rate limit errors
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

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
    // Don't retry rate limit errors
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 2;
    },
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!taskId) throw new Error("Task ID required");
      return tasksApi.addTag(taskId, tagId);
    },
    onSuccess: () => {
      // Invalidate to fetch fresh data with tag details
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
    addTag: addTagMutation.mutateAsync,
    removeTag: removeTagMutation.mutateAsync,
    isAdding: addTagMutation.isPending,
    isRemoving: removeTagMutation.isPending,
  };
}
