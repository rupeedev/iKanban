import { useQuery } from '@tanstack/react-query';
import { getSharedTaskAssignees } from '@/lib/remoteApi';
import type { UserData } from 'shared/types';

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

interface UseAssigneeUserNamesOptions {
  projectId: string | undefined;
}

export function useAssigneeUserNames(options: UseAssigneeUserNamesOptions) {
  const { projectId } = options;

  const { data: assignees, refetch } = useQuery<UserData[], Error>({
    queryKey: ['project', 'assignees', projectId],
    queryFn: () => getSharedTaskAssignees(projectId!),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents excessive refetching
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: (failureCount, error) => {
      // NEVER retry 429 errors - it amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds if retry needed
  });

  return {
    assignees,
    refetchAssignees: refetch,
  };
}
