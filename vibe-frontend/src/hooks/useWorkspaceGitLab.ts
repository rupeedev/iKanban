import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type {
  GitLabConnectionWithRepos,
  GitLabRepository,
  CreateGitLabConnection,
  UpdateGitLabConnection,
  LinkGitLabRepository,
  GitLabProjectInfo,
} from 'shared/types';

const QUERY_KEY = ['workspace', 'gitlab'];

export function useWorkspaceGitLabConnection() {
  return useQuery<GitLabConnectionWithRepos | null>({
    queryKey: QUERY_KEY,
    queryFn: () => teamsApi.getWorkspaceGitLabConnection(),
  });
}

export function useWorkspaceGitLabRepositories() {
  return useQuery<GitLabRepository[]>({
    queryKey: [...QUERY_KEY, 'repos'],
    queryFn: () => teamsApi.getWorkspaceGitLabRepositories(),
  });
}

export function useWorkspaceAvailableGitLabRepos(enabled = true) {
  return useQuery<GitLabProjectInfo[]>({
    queryKey: [...QUERY_KEY, 'available'],
    queryFn: () => teamsApi.getWorkspaceAvailableGitLabRepos(),
    enabled,
  });
}

export function useWorkspaceGitLabMutations() {
  const queryClient = useQueryClient();

  const createConnection = useMutation({
    mutationFn: (data: CreateGitLabConnection) =>
      teamsApi.createWorkspaceGitLabConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
        refetchType: 'none',
      });
    },
  });

  const updateConnection = useMutation({
    mutationFn: (data: UpdateGitLabConnection) =>
      teamsApi.updateWorkspaceGitLabConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
        refetchType: 'none',
      });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: () => teamsApi.deleteWorkspaceGitLabConnection(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
        refetchType: 'none',
      });
    },
  });

  const linkRepository = useMutation({
    mutationFn: (data: LinkGitLabRepository) =>
      teamsApi.linkWorkspaceGitLabRepository(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
        refetchType: 'none',
      });
    },
  });

  const unlinkRepository = useMutation({
    mutationFn: (repoId: string) =>
      teamsApi.unlinkWorkspaceGitLabRepository(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEY,
        refetchType: 'none',
      });
    },
  });

  return {
    createConnection,
    updateConnection,
    deleteConnection,
    linkRepository,
    unlinkRepository,
  };
}
