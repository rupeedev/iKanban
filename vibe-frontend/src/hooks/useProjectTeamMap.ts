import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type { Team } from 'shared/types';

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

export interface ProjectTeamInfo {
  team: Team;
  teamId: string;
  teamName: string;
  teamIdentifier: string | null;
  teamIcon: string | null;
}

export interface UseProjectTeamMapResult {
  /** Map of projectId to team info */
  projectTeamMap: Map<string, ProjectTeamInfo>;
  /** Get team info for a project */
  getTeamForProject: (projectId: string) => ProjectTeamInfo | undefined;
  isLoading: boolean;
}

/**
 * Hook to get a mapping of projects to their teams.
 * Uses parallel queries to fetch project lists for each team,
 * then builds a reverse lookup map.
 */
export function useProjectTeamMap(teams: Team[]): UseProjectTeamMapResult {
  // Fetch project IDs for each team in parallel
  const teamProjectQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ['teams', team.id, 'project-ids'],
      queryFn: () => teamsApi.getProjects(team.id),
      staleTime: 10 * 60 * 1000, // 10 minutes - team assignments rarely change
      gcTime: 30 * 60 * 1000, // 30 minutes cache retention
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount: number, error: unknown) => {
        if (isRateLimitError(error)) return false;
        return failureCount < 1;
      },
      retryDelay: 60000,
    })),
  });

  // Build reverse mapping: projectId -> team
  const projectTeamMap = useMemo(() => {
    const map = new Map<string, ProjectTeamInfo>();

    teamProjectQueries.forEach((query, index) => {
      if (query.data) {
        const team = teams[index];
        const projects = query.data;

        projects.forEach((project) => {
          map.set(project.id, {
            team,
            teamId: team.id,
            teamName: team.name,
            teamIdentifier: team.identifier,
            teamIcon: team.icon,
          });
        });
      }
    });

    return map;
  }, [teamProjectQueries, teams]);

  const getTeamForProject = useMemo(
    () => (projectId: string) => projectTeamMap.get(projectId),
    [projectTeamMap]
  );

  const isLoading = teamProjectQueries.some((q) => q.isLoading);

  return {
    projectTeamMap,
    getTeamForProject,
    isLoading,
  };
}
