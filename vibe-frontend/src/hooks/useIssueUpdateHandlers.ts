import { useCallback } from 'react';
import { teamsApi } from '@/lib/api';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

interface UseIssueUpdateHandlersParams {
  teamId: string;
  issuesById: Record<string, TaskWithAttemptStatus>;
  refresh: () => Promise<void>;
}

/**
 * Hook that provides handlers for updating team issues (assignee, priority, project, status).
 * Uses the teams API endpoint: PATCH /api/teams/{team_id}/issues/{issue_id}
 */
export function useIssueUpdateHandlers({
  teamId,
  issuesById,
  refresh,
}: UseIssueUpdateHandlersParams) {
  // Handler for assignee changes
  const handleAssigneeChange = useCallback(
    async (taskId: string, assigneeId: string | null) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          assignee_id: assigneeId,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update assignee:', err);
      }
    },
    [teamId, issuesById, refresh]
  );

  // Handler for priority changes
  const handlePriorityChange = useCallback(
    async (taskId: string, priority: number) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          priority,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update priority:', err);
      }
    },
    [teamId, issuesById, refresh]
  );

  // Handler for project changes - moves issue to a different project
  // Note: Moving issues between projects is not yet supported for team issues
  const handleProjectChange = useCallback(
    async (taskId: string, newProjectId: string) => {
      const issue = issuesById[taskId];
      if (!issue || issue.project_id === newProjectId) return;

      // TODO: Implement move endpoint for team issues
      console.warn('Moving issues between projects is not yet supported');
    },
    [issuesById]
  );

  // Handler for status changes (drag and drop)
  const handleStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const issue = issuesById[taskId];
      if (!issue || issue.status === newStatus) return;

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          status: newStatus,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update issue status:', err);
      }
    },
    [teamId, issuesById, refresh]
  );

  return {
    handleAssigneeChange,
    handlePriorityChange,
    handleProjectChange,
    handleStatusChange,
  };
}
