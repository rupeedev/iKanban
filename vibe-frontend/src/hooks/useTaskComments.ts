import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tasksApi, RequestTimeoutError } from '../lib/api';
import type {
  CreateTaskComment,
  UpdateTaskComment,
  TaskComment,
} from '../../../shared/types';

// Helper to detect rate limit errors
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

// Helper to detect timeout errors (IKA-348)
function isTimeoutError(error: unknown): boolean {
  return error instanceof RequestTimeoutError;
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      try {
        const comments = await tasksApi.getComments(taskId);
        return comments;
      } catch (error) {
        // Log error for debugging (IKA-322)
        console.error('[useTaskComments] Failed to fetch comments:', error);
        throw error;
      }
    },
    enabled: !!taskId,
    // Cache comments - show cached data instantly, refetch in background (IKA-344)
    staleTime: 30 * 1000, // 30 seconds - after this, refetch in background
    // Keep in cache for 15 minutes
    gcTime: 15 * 60 * 1000,
    // Don't retry rate limit errors
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 2;
    },
    // Don't refetch on window focus to reduce unnecessary calls
    refetchOnWindowFocus: false,
  });

  const createCommentMutation = useMutation({
    // Mutation key ensures proper tracking per task (IKA-322)
    mutationKey: ['create-comment', taskId],
    mutationFn: async (payload: CreateTaskComment) => {
      if (!taskId) throw new Error('Task ID is required');
      return tasksApi.createComment(taskId, payload);
    },
    onMutate: async (newCommentData) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['task-comments', taskId] });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData<TaskComment[]>([
        'task-comments',
        taskId,
      ]);

      // Optimistically update to the new value
      if (previousComments && taskId) {
        const optimisticComment = {
          id: `temp-${Date.now()}`,
          task_id: taskId,
          content: newCommentData.content,
          is_internal: newCommentData.is_internal || false,
          author_name:
            'author_name' in newCommentData
              ? String(newCommentData.author_name)
              : 'You',
          author_email:
            'author_email' in newCommentData
              ? String(newCommentData.author_email)
              : undefined,
          author_id:
            'author_id' in newCommentData
              ? (newCommentData.author_id as string)
              : undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as unknown as TaskComment; // Cast to satisfy type (some fields might be missing in strict mode)

        queryClient.setQueryData(
          ['task-comments', taskId],
          (old: TaskComment[] | undefined) => {
            return [...(old || []), optimisticComment];
          }
        );
      }

      // Return a context object with the snapshotted value
      return { previousComments };
    },
    onSuccess: (newComment) => {
      // Replace the optimistic comment with the real one
      queryClient.setQueryData(
        ['task-comments', taskId],
        (oldData: typeof commentsQuery.data) => {
          if (!oldData) return [newComment];
          // Filter out the temp comment and append the real one
          // We assume the temp comment is the last one or we filter by temp- prefix
          const cleanData = oldData.filter((c) => !c.id.startsWith('temp-'));

          // Check for duplicates just in case
          if (cleanData.some((c) => c.id === newComment.id)) return cleanData;
          return [...cleanData, newComment];
        }
      );
    },
    onError: (error, _newComment, context) => {
      // Log error for debugging (IKA-322)
      console.error('[useTaskComments] Create comment failed:', error);

      // Show user-friendly toast for timeout errors (IKA-348)
      if (isTimeoutError(error)) {
        toast.error('Request timed out', {
          description: 'The server took too long to respond. Please try again.',
        });
      }

      // Rollback to the previous value
      if (context?.previousComments) {
        queryClient.setQueryData(
          ['task-comments', taskId],
          context.previousComments
        );
      }
    },
    onSettled: () => {
      if (!taskId) return;
      // Just mark cache as stale - don't force immediate refetch
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'none', // Prevents hanging refetch
      });
    },
  });

  const updateCommentMutation = useMutation({
    mutationKey: ['update-comment', taskId],
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
    onMutate: async ({ commentId, payload }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['task-comments', taskId] });

      // Snapshot the previous value
      const previousComments = queryClient.getQueryData<TaskComment[]>([
        'task-comments',
        taskId,
      ]);

      // Optimistically update
      if (previousComments) {
        queryClient.setQueryData(
          ['task-comments', taskId],
          (old: TaskComment[] | undefined) => {
            if (!old) return [];
            return old.map((comment) => {
              if (comment.id === commentId) {
                return {
                  ...comment,
                  ...payload, // Apply partial updates (content, is_internal)
                  updated_at: new Date().toISOString(),
                };
              }
              return comment;
            });
          }
        );
      }

      return { previousComments };
    },
    onError: (error, _variables, context) => {
      console.error('[useTaskComments] Update comment failed:', error);
      // Rollback
      if (context?.previousComments) {
        queryClient.setQueryData(
          ['task-comments', taskId],
          context.previousComments
        );
      }
    },
    onSettled: () => {
      if (!taskId) return;
      // Just mark cache as stale - don't force immediate refetch
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'none',
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationKey: ['delete-comment', taskId],
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
    onError: (err, _commentId, context) => {
      console.error('[useTaskComments] Delete comment failed:', err);
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(
          ['task-comments', taskId],
          context.previousComments
        );
      }
    },
    onSettled: () => {
      if (!taskId) return;
      // Just mark cache as stale - don't force immediate refetch
      queryClient.invalidateQueries({
        queryKey: ['task-comments', taskId],
        refetchType: 'none',
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
