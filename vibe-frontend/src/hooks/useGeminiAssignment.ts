import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { CopilotAssignment, CreateCopilotAssignment } from 'shared/types';

/**
 * Query key factory for gemini assignments
 */
export const geminiAssignmentKeys = {
  all: ['gemini-assignments'] as const,
  list: (taskId: string) =>
    [...geminiAssignmentKeys.all, 'list', taskId] as const,
};

/**
 * Hook to fetch gemini assignments for a task
 */
export function useGeminiAssignments(taskId: string) {
  return useQuery({
    queryKey: geminiAssignmentKeys.list(taskId),
    queryFn: () => tasksApi.getGeminiAssignments(taskId),
    enabled: !!taskId,
  });
}

/**
 * Hook to get the latest gemini assignment for a task
 */
export function useLatestGeminiAssignment(taskId: string) {
  const { data: assignments, ...rest } = useGeminiAssignments(taskId);
  const latestAssignment = assignments?.[0] ?? null;
  return { latestAssignment, assignments, ...rest };
}

/**
 * Hook to assign a task to Gemini
 */
export function useAssignToGemini(options?: {
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
      return tasksApi.assignToGemini(taskId, data);
    },
    onSuccess: (assignment, { taskId }) => {
      // Invalidate the assignments list for this task
      queryClient.invalidateQueries({
        queryKey: geminiAssignmentKeys.list(taskId),
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
