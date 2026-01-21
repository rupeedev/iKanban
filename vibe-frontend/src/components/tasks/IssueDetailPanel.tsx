import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  X,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  FileText,
  Activity,
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useIssueCommentHandlers } from '@/hooks/useIssueCommentHandlers';
import { copilotAssignmentKeys } from '@/hooks/useCopilotAssignment';
import { claudeAssignmentKeys } from '@/hooks/useClaudeAssignment';
import { tasksApi } from '@/lib/api';
import { CommentList } from '@/components/comments';
import { IssueAttemptsSection } from '@/components/tasks/IssueAttemptsSection';
import { IssueLinkedDocuments } from '@/components/tasks/IssueLinkedDocuments';
import { ProjectSelector } from '@/components/tasks/ProjectSelector';
import { TaskTagsSection } from '@/components/tags/TaskTagsSection';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import {
  PrioritySelector,
  type PriorityValue,
} from '@/components/selectors/PrioritySelector';

interface IssueDetailPanelProps {
  issue: TaskWithAttemptStatus;
  teamId?: string;
  issueKey?: string;
  onClose: () => void;
  onUpdate?: () => Promise<void>;
}

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
  },
  inprogress: {
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  inreview: {
    bg: 'bg-blue-100 dark:bg-blue-900',
    text: 'text-blue-700 dark:text-blue-300',
  },
  done: {
    bg: 'bg-green-100 dark:bg-green-900',
    text: 'text-green-700 dark:text-green-300',
  },
  cancelled: {
    bg: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-700 dark:text-red-300',
  },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function IssueDetailPanel({
  issue,
  teamId,
  issueKey,
  onClose,
  onUpdate,
}: IssueDetailPanelProps) {
  const queryClient = useQueryClient();
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

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
    isUpdating,
    isDeleting,
    handleUpdateComment,
    handleDeleteComment,
  } = useIssueCommentHandlers({ issue, teamId, onUpdate });

  // Agent status refresh state
  const [isRefreshingAgentStatus, setIsRefreshingAgentStatus] = useState(false);

  // Handler to refresh agent status (Copilot/Claude assignments)
  const handleRefreshAgentStatus = useCallback(async () => {
    setIsRefreshingAgentStatus(true);
    try {
      // Invalidate both Copilot and Claude assignment queries to fetch fresh data
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: copilotAssignmentKeys.list(issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: claudeAssignmentKeys.list(issue.id),
        }),
        // Also refresh comments in case the backend updated them
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

  const handlePriorityChange = async (priority: PriorityValue) => {
    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: issue.title,
        description: issue.description,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update priority:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const statusColors =
    STATUS_COLORS[issue.status as TaskStatus] || STATUS_COLORS.todo;
  const statusLabel = STATUS_LABELS[issue.status as TaskStatus] || issue.status;
  const hasComments = comments.length > 0;
  const showCommentsLoading = commentsLoading && !hasComments;

  return (
    <div className="h-full w-full border-l bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {team && (
            <>
              <span className="font-medium text-foreground">
                {team.icon || '👥'} {team.name}
              </span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
          {issueKey && (
            <Badge variant="outline" className="font-mono text-xs">
              {issueKey}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
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

      {/* Main content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
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
                className="text-lg font-semibold border-0 shadow-none px-0 focus-visible:ring-0"
                autoFocus
                disabled={isSaving}
              />
            ) : (
              <h1
                className="text-lg font-semibold cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                onClick={() => setIsEditingTitle(true)}
              >
                {issue.title}
              </h1>
            )}
          </div>

          {/* Status and Priority row */}
          <div className="flex items-center gap-3">
            <Badge
              className={cn(statusColors.bg, statusColors.text, 'font-medium')}
            >
              {statusLabel}
            </Badge>
            <PrioritySelector
              value={(issue.priority || 0) as PriorityValue}
              onChange={handlePriorityChange}
              disabled={isSaving}
            />
          </div>

          {/* Project selector (move to project) */}
          {teamId && (
            <ProjectSelector
              taskId={issue.id}
              currentProjectId={issue.project_id}
              teamId={teamId}
              onMoved={onUpdate}
              disabled={isSaving}
            />
          )}

          {/* Tags */}
          <TaskTagsSection
            taskId={issue.id}
            teamId={teamId}
            editable={!isSaving}
          />

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Description
            </h3>
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Add a description..."
                  autoFocus
                  disabled={isSaving}
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
                  'min-h-[50px] p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-sm',
                  !issue.description && 'text-muted-foreground italic'
                )}
                onClick={() => setIsEditingDescription(true)}
              >
                {issue.description || 'Click to add a description...'}
              </div>
            )}
          </div>

          {/* Linked Documents */}
          <IssueLinkedDocuments issueId={issue.id} teamId={teamId} />

          {/* ATTEMPTS section with Inline Prompt (handles comments + AI prompts) */}
          <IssueAttemptsSection
            issueId={issue.id}
            projectId={issue.project_id}
            teamId={teamId}
          />

          {/* Tabs for Comments, Details, Activity */}
          <Tabs defaultValue="comments" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
              <TabsTrigger
                value="comments"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <MessageSquare className="h-4 w-4" />
                Comments
                {comments.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {comments.length}
                  </Badge>
                )}
                {commentsFetching && !commentsLoading && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger
                value="details"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="mt-4 space-y-4">
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
              {/* CommentEditor removed - comments are created via InlinePromptInput in ATTEMPTS section */}
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p>{new Date(issue.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated</span>
                    <p>{new Date(issue.updated_at).toLocaleString()}</p>
                  </div>
                  {issue.due_date && (
                    <div>
                      <span className="text-muted-foreground">Due Date</span>
                      <p>{new Date(issue.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  {issue.assignee_id && (
                    <div>
                      <span className="text-muted-foreground">Assignee</span>
                      <p>{issue.assignee_id}</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="text-sm text-muted-foreground">
                Activity log coming soon...
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
