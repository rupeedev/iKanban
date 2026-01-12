import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useRenameBranch(
  attemptId?: string,
  onSuccess?: (newBranchName: string) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<{ branch: string }, unknown, string>({
    mutationFn: async (newBranchName) => {
      if (!attemptId) throw new Error('Attempt id is not set');
      return attemptsApi.renameBranch(attemptId, newBranchName);
    },
    onSuccess: (data) => {
      if (attemptId) {
        queryClient.invalidateQueries({ queryKey: ['taskAttempt', attemptId], refetchType: 'none' });
        queryClient.invalidateQueries({ queryKey: ['attempt', attemptId], refetchType: 'none' });
        queryClient.invalidateQueries({
          queryKey: ['attemptBranch', attemptId],
          refetchType: 'none',
        });
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
          refetchType: 'none',
        });
        queryClient.invalidateQueries({ queryKey: ['taskAttempts'], refetchType: 'none' });
      }
      onSuccess?.(data.branch);
    },
    onError: (err) => {
      console.error('Failed to rename branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
          refetchType: 'none',
        });
      }
      onError?.(err);
    },
  });
}
