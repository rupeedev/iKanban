import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useTaskComments } from '@/hooks/useTaskComments';
import { useAgentMentions } from '@/hooks/useAgentMentions';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useProjectRepos, useNavigateWithSearch } from '@/hooks';
import { useRepoBranchSelection } from '@/hooks/useRepoBranchSelection';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useClerkUser } from '@/hooks/auth/useClerkAuth';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus } from 'shared/types';

interface UseIssueCommentHandlersOptions {
  issue: TaskWithAttemptStatus;
  teamId?: string;
  onUpdate?: () => Promise<void>;
}

export function useIssueCommentHandlers({
  issue,
  teamId,
  onUpdate,
}: UseIssueCommentHandlersOptions) {
  const navigate = useNavigateWithSearch();
  const { user } = useClerkUser();
  const { members } = useTeamMembers(teamId);

  // AI Agent integration hooks
  const { parseMentions, resolveMentionToProfile } = useAgentMentions();
  const { data: projectRepos = [] } = useProjectRepos(issue.project_id);
  const { getWorkspaceRepoInputs } = useRepoBranchSelection({
    repos: projectRepos,
    enabled: projectRepos.length > 0,
  });
  const { createAttempt, isCreating: isCreatingAttempt } = useAttemptCreation({
    taskId: issue.id,
    onSuccess: (attempt) => {
      navigate(paths.attempt(issue.project_id, issue.id, attempt.id));
    },
  });

  // Comments with caching
  const {
    comments,
    isLoading: commentsLoading,
    isFetching: commentsFetching,
    refetch: refetchComments,
    createComment,
    updateComment,
    deleteComment,
    isCreating,
    isUpdating,
    isDeleting,
  } = useTaskComments(issue.id);

  // Extract user info from Clerk user
  const currentUser = useMemo(() => {
    if (!user) {
      return { id: null, name: 'Unknown', email: '' };
    }
    const userEmail = user.primaryEmailAddress?.emailAddress || '';
    const userName =
      user.fullName || user.firstName || userEmail.split('@')[0] || 'Unknown';
    const matchingMember = members?.find((m) => m.email === userEmail);
    return {
      id: matchingMember?.id ?? null,
      name: matchingMember?.display_name || userName,
      email: userEmail,
    };
  }, [user, members]);

  const handleSubmitComment = useCallback(
    async (content: string, isInternal: boolean) => {
      const { agent, cleanPrompt } = parseMentions(content);

      await createComment({
        content,
        is_internal: isInternal,
        author_name: currentUser.name,
        author_email: currentUser.email,
        author_id: currentUser.id,
      });

      if (agent && cleanPrompt) {
        if (projectRepos.length === 0) {
          toast.info('Comment saved', {
            description:
              'AI agent requires a project with repositories configured.',
          });
          return;
        }

        const profile = resolveMentionToProfile(agent);
        if (!profile) {
          toast.info('Comment saved', {
            description: `Agent "${agent.displayName}" is not available. Check your AI provider keys.`,
          });
          return;
        }

        try {
          const repos = getWorkspaceRepoInputs();
          await createAttempt({ profile, repos, prompt: cleanPrompt });
        } catch (err) {
          console.error('Failed to create AI attempt:', err);
          toast.error('Failed to start AI agent', {
            description: 'Comment was saved. Please try again.',
          });
        }
      }
    },
    [
      createComment,
      currentUser,
      parseMentions,
      resolveMentionToProfile,
      projectRepos.length,
      getWorkspaceRepoInputs,
      createAttempt,
    ]
  );

  const handleSubmitAndClose = useCallback(
    async (content: string, isInternal: boolean) => {
      const { agent, cleanPrompt } = parseMentions(content);

      await createComment({
        content,
        is_internal: isInternal,
        author_name: currentUser.name,
        author_email: currentUser.email,
        author_id: currentUser.id,
      });

      await tasksApi.update(issue.id, {
        title: issue.title,
        description: issue.description,
        status: 'done',
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });

      if (onUpdate) await onUpdate();

      if (agent && cleanPrompt) {
        if (projectRepos.length === 0) {
          toast.info('Issue closed', {
            description:
              'AI agent requires a project with repositories configured.',
          });
          return;
        }

        const profile = resolveMentionToProfile(agent);
        if (!profile) {
          toast.info('Issue closed', {
            description: `Agent "${agent.displayName}" is not available. Check your AI provider keys.`,
          });
          return;
        }

        try {
          const repos = getWorkspaceRepoInputs();
          await createAttempt({ profile, repos, prompt: cleanPrompt });
        } catch (err) {
          console.error('Failed to create AI attempt:', err);
          toast.error('Failed to start AI agent', {
            description: 'Issue was closed. Please try again.',
          });
        }
      }
    },
    [
      createComment,
      currentUser,
      issue,
      onUpdate,
      parseMentions,
      resolveMentionToProfile,
      projectRepos.length,
      getWorkspaceRepoInputs,
      createAttempt,
    ]
  );

  const handleUpdateComment = useCallback(
    async (commentId: string, content: string, isInternal: boolean) => {
      await updateComment({
        commentId,
        payload: { content, is_internal: isInternal },
      });
    },
    [updateComment]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId);
    },
    [deleteComment]
  );

  return {
    comments,
    commentsLoading,
    commentsFetching,
    refetchComments,
    isCreating,
    isUpdating,
    isDeleting,
    isCreatingAttempt,
    handleSubmitComment,
    handleSubmitAndClose,
    handleUpdateComment,
    handleDeleteComment,
  };
}
