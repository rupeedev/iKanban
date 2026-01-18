import { useCallback } from 'react';
import { tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

interface UseIssueUpdateHandlersParams {
  issuesById: Record<string, TaskWithAttemptStatus>;
  refresh: () => Promise<void>;
}

/**
 * Hook that provides handlers for updating issues (assignee, priority, project, status).
 * Extracted from TeamIssues to reduce component complexity.
 */
export function useIssueUpdateHandlers({
  issuesById,
  refresh,
}: UseIssueUpdateHandlersParams) {
  // Handler for assignee changes
  const handleAssigneeChange = useCallback(
    async (taskId: string, assigneeId: string | null) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await tasksApi.update(taskId, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
          priority: issue.priority,
          due_date: issue.due_date,
          assignee_id: assigneeId,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update assignee:', err);
      }
    },
    [issuesById, refresh]
  );

  // Handler for priority changes
  const handlePriorityChange = useCallback(
    async (taskId: string, priority: number) => {
      const issue = issuesById[taskId];
      if (!issue) return;

      try {
        await tasksApi.update(taskId, {
          title: issue.title,
          description: issue.description,
          status: issue.status,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
          priority,
          due_date: issue.due_date,
          assignee_id: issue.assignee_id,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update priority:', err);
      }
    },
    [issuesById, refresh]
  );

  // Handler for project changes - moves issue to a different project
  const handleProjectChange = useCallback(
    async (taskId: string, newProjectId: string) => {
      const issue = issuesById[taskId];
      if (!issue || issue.project_id === newProjectId) return;

      try {
        await tasksApi.move(taskId, newProjectId);
        await refresh();
      } catch (err) {
        console.error('Failed to move issue to new project:', err);
      }
    },
    [issuesById, refresh]
  );

  // Handler for status changes (drag and drop)
  const handleStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const issue = issuesById[taskId];
      if (!issue || issue.status === newStatus) return;

      try {
        await tasksApi.update(taskId, {
          title: issue.title,
          description: issue.description,
          status: newStatus,
          parent_workspace_id: issue.parent_workspace_id,
          image_ids: null,
          priority: null,
          due_date: null,
          assignee_id: null,
        });
        await refresh();
      } catch (err) {
        console.error('Failed to update issue status:', err);
      }
    },
    [issuesById, refresh]
  );

  return {
    handleAssigneeChange,
    handlePriorityChange,
    handleProjectChange,
    handleStatusChange,
  };
}
