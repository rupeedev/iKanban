/**
 * Story Task Group - Collapsible story with its child tasks.
 * IKA-235: Visual hierarchy for epic → story → task relationships.
 */
import { useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFeatureExpanded } from '@/stores/featureTreeStore';
import { StatusIcon } from '@/utils/StatusIcons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import type { StoryGroup } from '@/lib/epicGrouping';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

export interface StoryTaskGroupProps {
  story: StoryGroup;
  teamIdentifier?: string;
  onTaskClick?: (task: TaskWithAttemptStatus) => void;
}

function getProgressColor(percentage: number): string {
  if (percentage === 0) return 'bg-gray-300';
  if (percentage < 50) return 'bg-amber-500';
  if (percentage < 100) return 'bg-blue-500';
  return 'bg-green-500';
}

function getIssueKey(
  teamIdentifier: string | undefined,
  issueNumber: number | null | undefined
): string | null {
  if (!teamIdentifier || !issueNumber) return null;
  return `${teamIdentifier}-${issueNumber}`;
}

export function StoryTaskGroup({
  story,
  teamIdentifier,
  onTaskClick,
}: StoryTaskGroupProps) {
  const [isExpanded, toggle] = useFeatureExpanded(story.storyId);
  const isCompleted = story.percentage === 100;

  const progressColor = useMemo(
    () => getProgressColor(story.percentage),
    [story.percentage]
  );

  const handleToggle = useCallback(() => {
    toggle();
  }, [toggle]);

  // Sort tasks: in-progress first, then todo, then done
  const sortedTasks = useMemo(() => {
    return [...story.tasks].sort((a, b) => {
      const statusOrder: Record<TaskStatus, number> = {
        inprogress: 0,
        inreview: 1,
        todo: 2,
        done: 3,
        cancelled: 4,
      };
      return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    });
  }, [story.tasks]);

  return (
    <div
      data-testid="story-task-group"
      className={cn(isCompleted && 'opacity-70')}
    >
      {/* Story Header */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'hover:bg-muted/50 transition-colors'
        )}
      >
        {/* Indent + Expand/Collapse */}
        <span className="w-4" /> {/* Indent to align under epic */}
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        {/* Story Icon */}
        {isCompleted ? (
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
        ) : (
          <div
            className={cn(
              'h-4 w-4 rounded border-2 flex-shrink-0',
              story.percentage > 0 ? 'border-blue-400' : 'border-gray-300'
            )}
          />
        )}
        {/* Story Info */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{story.storyName}</span>
          {story.completedAt && (
            <span className="text-xs text-green-600 ml-2">
              (Completed {format(story.completedAt, 'MMM d')})
            </span>
          )}
        </div>
        {/* Task Count */}
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          {story.doneCount}/{story.totalCount}
        </Badge>
        {/* Progress Bar */}
        <div className="w-20 flex-shrink-0">
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all', progressColor)}
              style={{ width: `${story.percentage}%` }}
            />
          </div>
        </div>
        {/* Percentage */}
        <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
          {story.percentage}%
        </span>
      </button>

      {/* Expanded Content - Tasks */}
      {isExpanded && (
        <div className="pl-12 pr-4 pb-2 space-y-1">
          {sortedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              teamIdentifier={teamIdentifier}
              onClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: TaskWithAttemptStatus;
  teamIdentifier?: string;
  onClick?: (task: TaskWithAttemptStatus) => void;
}

function TaskRow({ task, teamIdentifier, onClick }: TaskRowProps) {
  const issueKey = getIssueKey(teamIdentifier, task.issue_number);
  const isDone = task.status === 'done';
  const completedDate =
    isDone && task.updated_at ? new Date(task.updated_at) : null;

  const handleClick = useCallback(() => {
    onClick?.(task);
  }, [onClick, task]);

  return (
    <div
      data-testid="task-row"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer',
        'hover:bg-muted/50 transition-colors',
        isDone && 'opacity-60'
      )}
    >
      {/* Status Icon */}
      <StatusIcon status={task.status} className="h-4 w-4 flex-shrink-0" />

      {/* Issue Key */}
      {issueKey && (
        <span className="text-xs text-muted-foreground font-mono w-16 flex-shrink-0">
          {issueKey}
        </span>
      )}

      {/* Title */}
      <span className={cn('text-sm flex-1 truncate', isDone && 'line-through')}>
        {task.title}
      </span>

      {/* Completion Date */}
      {completedDate && (
        <span className="text-xs text-green-600 flex-shrink-0">
          {format(completedDate, 'MMM d')}
        </span>
      )}

      {/* Assignee */}
      <Avatar className="h-5 w-5 flex-shrink-0">
        <AvatarFallback className="text-[9px] bg-muted">
          <User className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
