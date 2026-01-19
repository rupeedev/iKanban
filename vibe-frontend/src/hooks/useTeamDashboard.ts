import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type {
  TeamDashboard,
  TaskWithAttemptStatus,
  TaskStatus,
} from 'shared/types';

// Query key factory for consistent caching
export const teamDashboardKeys = {
  all: ['team-dashboard'] as const,
  team: (teamId: string) => [...teamDashboardKeys.all, teamId] as const,
};

export interface UseTeamDashboardResult {
  dashboard: TeamDashboard | undefined;
  // Convenience accessors
  team: TeamDashboard['team'] | undefined;
  members: TeamDashboard['members'];
  projectIds: TeamDashboard['project_ids'];
  projects: TeamDashboard['projects'];
  issues: TeamDashboard['issues'];
  // Derived data
  issuesById: Record<string, TaskWithAttemptStatus>;
  issuesByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  // Query state
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Aggregated hook for fetching all team dashboard data in a single request.
 * Replaces 5+ separate hooks (useTeams, useProjects, useTeamMembers, useTeamProjects, useTeamIssues)
 * to prevent 429 rate limiting errors.
 */
export function useTeamDashboard(
  teamId: string | undefined
): UseTeamDashboardResult {
  const queryClient = useQueryClient();

  const {
    data: dashboard,
    isLoading,
    isFetching,
    error,
  } = useQuery<TeamDashboard>({
    queryKey: teamDashboardKeys.team(teamId!),
    queryFn: () => teamsApi.getDashboard(teamId!),
    enabled: !!teamId,
    // Use global defaults from main.tsx for staleTime, gcTime, retry, etc.
  });

  const refresh = useCallback(async () => {
    if (!teamId) return;
    // Force refetch - ignores cache and staleTime, makes network request
    await queryClient.refetchQueries({
      queryKey: teamDashboardKeys.team(teamId),
      type: 'active',
    });
  }, [teamId, queryClient]);

  // Extract data with defaults - using useMemo for arrays to prevent dependency warnings
  const team = dashboard?.team;
  const members = useMemo(() => dashboard?.members ?? [], [dashboard?.members]);
  const projectIds = useMemo(
    () => dashboard?.project_ids ?? [],
    [dashboard?.project_ids]
  );
  const projects = useMemo(
    () => dashboard?.projects ?? [],
    [dashboard?.projects]
  );
  const issues = useMemo(() => dashboard?.issues ?? [], [dashboard?.issues]);

  // Derived: issues indexed by ID
  const issuesById = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.id] = issue;
        return acc;
      },
      {} as Record<string, TaskWithAttemptStatus>
    );
  }, [issues]);

  // Derived: issues grouped by status
  const issuesByStatus = useMemo(() => {
    const byStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      byStatus[issue.status]?.push(issue);
    });

    // Sort each status by created_at descending
    Object.values(byStatus).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return byStatus;
  }, [issues]);

  return {
    dashboard,
    team,
    members,
    projectIds,
    projects,
    issues,
    issuesById,
    issuesByStatus,
    isLoading,
    isFetching,
    error: error
      ? error instanceof Error
        ? error
        : new Error('Failed to fetch team dashboard')
      : null,
    refresh,
  };
}
