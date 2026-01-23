import { useQuery } from '@tanstack/react-query';
import { teamsApi } from '../lib/api';
import type { Project } from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('429') ||
      error.message.includes('Too Many Requests')
    );
  }
  return false;
}

export function useTeamProjects(teamId: string | undefined) {
  // Fetch full project data for this team directly from API
  // The backend returns full Project objects, not just IDs
  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<Project[]>({
    queryKey: ['teams', teamId, 'projects', 'full'],
    queryFn: async () => {
      if (!teamId) return [];
      // Get projects for this team - backend returns full Project objects
      const fetched = await teamsApi.getProjects(teamId);
      if (fetched.length === 0) return [];

      // Sort by creation date descending
      return fetched.sort(
        (a, b) =>
          new Date(b.created_at as unknown as string).getTime() -
          new Date(a.created_at as unknown as string).getTime()
      );
    },
    enabled: Boolean(teamId),
    staleTime: 5 * 60 * 1000, // 5 minutes - team projects don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Never retry rate limit errors - this amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  return {
    projects,
    projectIds: projects.map((p) => p.id),
    isLoading,
    isFetching,
    refetch,
    error: error ? new Error(String(error)) : null,
  };
}
