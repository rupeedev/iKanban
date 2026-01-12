import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { CopilotAssignment, CreateCopilotAssignment } from 'shared/types';

/**
 * Query key factory for copilot assignments
 */
export const copilotAssignmentKeys = {
  all: ['copilot-assignments'] as const,
  list: (taskId: string) => [...copilotAssignmentKeys.all, 'list', taskId] as const,
};

/**
 * Hook to fetch copilot assignments for a task
 */
export function useCopilotAssignments(taskId: string) {
  return useQuery({
    queryKey: copilotAssignmentKeys.list(taskId),
    queryFn: () => tasksApi.getCopilotAssignments(taskId),
    enabled: !!taskId,
  });
}

/**
 * Hook to get the latest copilot assignment for a task
 */
export function useLatestCopilotAssignment(taskId: string) {
  const { data: assignments, ...rest } = useCopilotAssignments(taskId);
  const latestAssignment = assignments?.[0] ?? null;
  return { latestAssignment, assignments, ...rest };
}

/**
 * Hook to assign a task to Copilot
 */
export function useAssignToCopilot(options?: {
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
      return tasksApi.assignToCopilot(taskId, data);
    },
    onSuccess: (assignment, { taskId }) => {
      // Invalidate the assignments list for this task
      queryClient.invalidateQueries({ queryKey: copilotAssignmentKeys.list(taskId) });
      // Also invalidate task comments since a comment may have been created
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
      options?.onSuccess?.(assignment);
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}
