import { useQuery } from '@tanstack/react-query';
import { fileSystemApi } from '@/lib/api';
import type { DirectoryEntry } from 'shared/types';

/**
 * Hook to fetch git repositories from the filesystem.
 * Uses TanStack Query for caching and request deduplication to prevent 429 errors.
 *
 * Global defaults in main.tsx already provide:
 * - staleTime: 30 minutes
 * - retry: skips 429 errors
 * - refetchOnWindowFocus: false
 */
export function useGitRepos(enabled: boolean = true) {
  const {
    data: repos = [],
    isLoading,
    error,
    refetch,
  } = useQuery<DirectoryEntry[]>({
    queryKey: ['filesystem', 'git-repos'],
    queryFn: () => fileSystemApi.listGitRepos(),
    enabled,
    // Using a shorter staleTime since repos list might change as user works
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    repos,
    isLoading,
    error: error instanceof Error ? error : null,
    refetch,
  };
}
