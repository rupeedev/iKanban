import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, sessionsApi } from '@/lib/api';
import type {
  ExecutorProfileId,
  WorkspaceRepoInput,
  Workspace,
} from 'shared/types';

type CreateAttemptArgs = {
  profile: ExecutorProfileId;
  repos: WorkspaceRepoInput[];
  prompt?: string;
};

type UseAttemptCreationArgs = {
  taskId: string;
  onSuccess?: (attempt: Workspace) => void;
};

export function useAttemptCreation({
  taskId,
  onSuccess,
}: UseAttemptCreationArgs) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ profile, repos, prompt }: CreateAttemptArgs) => {
      // Step 1: Create the workspace (attempt)
      const workspace = await attemptsApi.create({
        task_id: taskId,
        executor_profile_id: profile,
        repos,
      });

      // Step 2: If a prompt is provided, create session and start execution
      if (prompt) {
        const session = await sessionsApi.create({
          workspace_id: workspace.id,
          executor: profile.executor,
        });

        await sessionsApi.followUp(session.id, {
          prompt,
          variant: profile.variant ?? null,
          retry_process_id: null,
          force_when_dirty: null,
          perform_git_reset: null,
        });
      }

      return workspace;
    },
    onSuccess: (newAttempt: Workspace) => {
      queryClient.setQueryData(
        ['taskAttempts', taskId],
        (old: Workspace[] = []) => [newAttempt, ...old]
      );
      onSuccess?.(newAttempt);
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
