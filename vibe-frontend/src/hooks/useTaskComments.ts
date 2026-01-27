import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { tasksApi } from '../lib/api';
import type {
  CreateTaskComment,
  UpdateTaskComment,
} from '../../../shared/types';

// Helper to detect rate limit errors
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return tasksApi.getComments(taskId);
    },
    enabled: !!taskId,
    // Cache comments for 5 minutes to reduce API calls
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 15 minutes
    gcTime: 15 * 60 * 1000,
    // Keep previous data while fetching new task's comments
    placeholderData: keepPreviousData,
    // Don't retry rate limit errors
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 2;
    },
    // Don't refetch on window focus to reduce unnecessary calls
    refetchOnWindowFocus: false,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (payload: CreateTaskComment) => {
      if (!taskId) throw new Error('Task ID is required');
      return tasksApi.createComment(taskId, payload);
    },
    onSuccess: (newComment) => {
      // Add optimistic update: immediately add the new comment to the cache
      queryClient.setQueryData(
        ['task-comments', taskId],
        (oldData: typeof commentsQuery.data) => {
          if (!oldData) return [newComment];
          // Check if comment already exists to avoid duplicates
          if (oldData.some((c) => c.id === newComment.id)) return oldData;
          return [...oldData, newComment];
        }
      );
    },
    onSettled: () => {
      // Always refetch after mutation settles (success or error) to ensure sync
      // Use 'all' to ensure all components watching this query get updated
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'all',
      });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: UpdateTaskComment;
    }) => {
      if (!taskId) throw new Error('Task ID is required');
      return tasksApi.updateComment(taskId, commentId, payload);
    },
    onSettled: () => {
      // Always refetch after mutation settles to ensure sync
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'all',
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!taskId) throw new Error('Task ID is required');
      await tasksApi.deleteComment(taskId, commentId);
    },
    onMutate: async (commentId) => {
      // Optimistic delete: remove comment immediately from cache
      await queryClient.cancelQueries({ queryKey: ['task-comments', taskId] });
      const previousComments = queryClient.getQueryData<
        typeof commentsQuery.data
      >(['task-comments', taskId]);
      queryClient.setQueryData(
        ['task-comments', taskId],
        (oldData: typeof commentsQuery.data) =>
          oldData?.filter((c) => c.id !== commentId) ?? []
      );
      return { previousComments };
    },
    onError: (_err, _commentId, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(
          ['task-comments', taskId],
          context.previousComments
        );
      }
    },
    onSettled: () => {
      // Always refetch after mutation settles to ensure sync
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'all',
      });
    },
  });

  // Sort comments by created_at descending (newest first)
  const sortedComments = [...(commentsQuery.data ?? [])].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA; // Descending order (newest first)
  });

  return {
    comments: sortedComments,
    isLoading: commentsQuery.isLoading,
    isFetching: commentsQuery.isFetching,
    error: commentsQuery.error,
    refetch: commentsQuery.refetch,
    createComment: createCommentMutation.mutateAsync,
    updateComment: updateCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    isCreating: createCommentMutation.isPending,
    isUpdating: updateCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
  };
}
