import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { CopilotAssignment, CreateCopilotAssignment } from 'shared/types';

/**
 * Query key factory for claude assignments
 */
export const claudeAssignmentKeys = {
  all: ['claude-assignments'] as const,
  list: (taskId: string) =>
    [...claudeAssignmentKeys.all, 'list', taskId] as const,
};

/**
 * Hook to fetch claude assignments for a task
 */
export function useClaudeAssignments(taskId: string) {
  return useQuery({
    queryKey: claudeAssignmentKeys.list(taskId),
    queryFn: () => tasksApi.getClaudeAssignments(taskId),
    enabled: !!taskId,
  });
}

/**
 * Hook to get the latest claude assignment for a task
 */
export function useLatestClaudeAssignment(taskId: string) {
  const { data: assignments, ...rest } = useClaudeAssignments(taskId);
  const latestAssignment = assignments?.[0] ?? null;
  return { latestAssignment, assignments, ...rest };
}

/**
 * Hook to assign a task to Claude (IKA-171)
 */
export function useAssignToClaude(options?: {
  onSuccess?: (assignment: CopilotAssignment) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      data,
    }: {
      taskId: string;
      data: CreateCopilotAssignment;
    }) => {
      return tasksApi.assignToClaude(taskId, data);
    },
    onSuccess: (assignment, { taskId }) => {
      // Invalidate the assignments list for this task
      queryClient.invalidateQueries({
        queryKey: claudeAssignmentKeys.list(taskId),
      });
      // Also invalidate task comments since a comment may have been created
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      options?.onSuccess?.(assignment);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}
