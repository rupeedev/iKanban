import { useCallback } from 'react';
import { toast } from 'sonner';
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
      if (!teamId) {
        toast.error('Team not loaded yet');
        return;
      }
      const issue = issuesById[taskId];
      if (!issue) {
        toast.error('Issue not found');
        return;
      }

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          assignee_id: assigneeId,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update assignee:', err);
        toast.error('Failed to update assignee');
      }
    },
    [teamId, issuesById, refresh]
  );

  // Handler for priority changes
  const handlePriorityChange = useCallback(
    async (taskId: string, priority: number) => {
      if (!teamId) {
        toast.error('Team not loaded yet');
        return;
      }
      const issue = issuesById[taskId];
      if (!issue) {
        toast.error('Issue not found');
        return;
      }

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          priority,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update priority:', err);
        toast.error('Failed to update priority');
      }
    },
    [teamId, issuesById, refresh]
  );

  // Handler for project changes - moves issue to a different project
  const handleProjectChange = useCallback(
    async (taskId: string, newProjectId: string) => {
      if (!teamId) {
        toast.error('Team not loaded yet');
        return;
      }
      const issue = issuesById[taskId];
      if (!issue) {
        toast.error('Issue not found');
        return;
      }
      if (issue.project_id === newProjectId) return;

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          project_id: newProjectId,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to move issue to project:', err);
        toast.error('Failed to move issue');
      }
    },
    [teamId, issuesById, refresh]
  );

  // Handler for status changes (drag and drop)
  const handleStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      if (!teamId) {
        toast.error('Team not loaded yet');
        return;
      }
      const issue = issuesById[taskId];
      if (!issue) {
        toast.error('Issue not found');
        return;
      }
      if (issue.status === newStatus) return;

      try {
        await teamsApi.updateIssue(teamId, taskId, {
          status: newStatus,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update issue status:', err);
        toast.error('Failed to update status');
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
