import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  X,
  ExternalLink,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useIssueCommentHandlers } from '@/hooks/useIssueCommentHandlers';
import { copilotAssignmentKeys } from '@/hooks/useCopilotAssignment';
import { claudeAssignmentKeys } from '@/hooks/useClaudeAssignment';
import { tasksApi, teamsApi } from '@/lib/api';
import { CommentList } from '@/components/comments';
// Attempts section hidden per IKA-295 - keeping import for future use
// import { IssueAttemptsSection } from '@/components/tasks/IssueAttemptsSection';
import { IssueLinkedDocuments } from '@/components/tasks/IssueLinkedDocuments';
import { IssuePropertiesSidebar } from '@/components/tasks/IssuePropertiesSidebar';
import { InlinePromptInput } from '@/components/tasks/TaskDetails/InlinePromptInput';
import { showSubIssuesDialog } from '@/components/dialogs';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { PriorityValue } from '@/components/selectors/PrioritySelector';

interface IssueFullViewProps {
  issue: TaskWithAttemptStatus;
  teamId?: string;
  issueKey?: string;
  teamMembers?: Array<{
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  }>;
  teamProjects?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onUpdate?: () => Promise<void>;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}

export function IssueFullView({
  issue,
  teamId,
  issueKey,
  teamMembers = [],
  teamProjects = [],
  onClose,
  onUpdate,
  onNavigatePrev,
  onNavigateNext,
  currentIndex,
  totalCount,
}: IssueFullViewProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  // Navigate back to team issues page
  const handleNavigateToIssues = useCallback(() => {
    if (team) {
      navigate(`/teams/${team.identifier || teamId}/issues`);
    }
  }, [navigate, team, teamId]);

  // Local state for editing
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Comment handlers from custom hook
  const {
    comments,
    commentsLoading,
    commentsFetching,
    refetchComments,
    isUpdating,
    isDeleting,
    handleUpdateComment,
    handleDeleteComment,
  } = useIssueCommentHandlers({ issue, teamId, onUpdate });

  // Handler for opening sub-issues dialog
  const handleOpenSubIssuesDialog = useCallback(() => {
    showSubIssuesDialog({
      issueId: issue.id,
      issueTitle: issue.title,
      teamId,
    });
  }, [issue.id, issue.title, teamId]);

  // State for comments refresh
  const [isRefreshingComments, setIsRefreshingComments] = useState(false);

  const handleRefreshComments = useCallback(async () => {
    setIsRefreshingComments(true);
    try {
      await refetchComments();
    } finally {
      setIsRefreshingComments(false);
    }
  }, [refetchComments]);

  // Agent status refresh state
  const [isRefreshingAgentStatus, setIsRefreshingAgentStatus] = useState(false);

  const handleRefreshAgentStatus = useCallback(async () => {
    setIsRefreshingAgentStatus(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: copilotAssignmentKeys.list(issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: claudeAssignmentKeys.list(issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-comments', issue.id],
        }),
      ]);
    } finally {
      setIsRefreshingAgentStatus(false);
    }
  }, [queryClient, issue.id]);

  const handleSaveTitle = async () => {
    if (!title.trim() || title === issue.title) {
      setTitle(issue.title);
      setIsEditingTitle(false);
      return;
    }
    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: title.trim(),
        description: issue.description,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update title:', err);
      setTitle(issue.title);
    } finally {
      setIsSaving(false);
      setIsEditingTitle(false);
    }
  };

  const handleSaveDescription = async () => {
    if (description === (issue.description || '')) {
      setIsEditingDescription(false);
      return;
    }
    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: issue.title,
        description: description.trim() || null,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update description:', err);
      setDescription(issue.description || '');
    } finally {
      setIsSaving(false);
      setIsEditingDescription(false);
    }
  };

  const handleStatusChange = async (status: TaskStatus) => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      await teamsApi.updateIssue(teamId, issue.id, { status });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePriorityChange = async (priority: PriorityValue) => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      await teamsApi.updateIssue(teamId, issue.id, { priority });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update priority:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssigneeChange = async (assigneeId: string | null) => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      await teamsApi.updateIssue(teamId, issue.id, { assignee_id: assigneeId });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update assignee:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      await teamsApi.updateIssue(teamId, issue.id, { project_id: projectId });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update project:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasComments = comments.length > 0;
  const showCommentsLoading = commentsLoading && !hasComments;
  const showNavigation =
    currentIndex !== undefined && totalCount !== undefined && totalCount > 1;

  return (
    <div className="h-full w-full bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {team && (
            <>
              <button
                onClick={handleNavigateToIssues}
                className="font-medium text-foreground hover:text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                {team.icon || '👥'} {team.name}
              </button>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
          {issueKey && (
            <Badge variant="outline" className="font-mono text-xs">
              {issueKey}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Navigation */}
          {showNavigation && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-sm text-muted-foreground">
                {currentIndex! + 1} / {totalCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onNavigatePrev}
                disabled={currentIndex === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onNavigateNext}
                disabled={currentIndex === totalCount! - 1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content with sidebar */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Main content area - wider with less wasted space */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-4 space-y-4">
            {/* Title */}
            <div>
              {isEditingTitle ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitle(issue.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="text-2xl font-semibold border-0 shadow-none px-0 focus-visible:ring-0 h-auto py-1"
                  autoFocus
                  disabled={isSaving}
                />
              ) : (
                <h1
                  className="text-2xl font-semibold cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
                  onClick={() => setIsEditingTitle(true)}
                >
                  {issue.title}
                </h1>
              )}
            </div>

            {/* Description - scrollable with max height */}
            <div className="space-y-2">
              {isEditingDescription ? (
                <div className="space-y-3">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a description..."
                    className="min-h-[120px] max-h-[200px] resize-y"
                    disabled={isSaving}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveDescription}
                      disabled={isSaving}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDescription(issue.description || '');
                        setIsEditingDescription(false);
                      }}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'min-h-[60px] max-h-[180px] overflow-y-auto p-3 rounded-md border cursor-pointer hover:bg-muted/50 text-sm whitespace-pre-wrap',
                    !issue.description && 'text-muted-foreground italic'
                  )}
                  onClick={() => setIsEditingDescription(true)}
                >
                  {issue.description || 'Click to add a description...'}
                </div>
              )}
            </div>

            {/* Sub-issues */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={handleOpenSubIssuesDialog}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add sub-issues
                </Button>
              </div>
            </div>

            {/* Linked Documents */}
            <IssueLinkedDocuments issueId={issue.id} teamId={teamId} />

            {/* Inline Prompt Input - handles both comments and AI prompts */}
            <InlinePromptInput taskId={issue.id} teamId={teamId} />

            {/* Activity / Comments Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Activity</h3>
                <div className="flex items-center gap-2">
                  {(commentsFetching || isRefreshingComments) &&
                    !commentsLoading && (
                      <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                    )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleRefreshComments}
                    disabled={isRefreshingComments || commentsFetching}
                    title="Refresh comments"
                  >
                    <RefreshCw
                      className={cn(
                        'h-4 w-4',
                        (isRefreshingComments || commentsFetching) &&
                          'animate-spin'
                      )}
                    />
                  </Button>
                </div>
              </div>
              <CommentList
                comments={comments}
                isLoading={showCommentsLoading}
                onUpdate={handleUpdateComment}
                onDelete={handleDeleteComment}
                onRefreshAgentStatus={handleRefreshAgentStatus}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
                isRefreshingAgentStatus={isRefreshingAgentStatus}
              />
            </div>
          </div>
        </div>

        {/* Properties Sidebar */}
        <IssuePropertiesSidebar
          issue={issue}
          teamId={teamId}
          teamMembers={teamMembers}
          teamProjects={teamProjects}
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onAssigneeChange={handleAssigneeChange}
          onProjectChange={handleProjectChange}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
}
