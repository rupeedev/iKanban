/**
 * Epic Progress Card - Displays an epic with its stories and progress.
 * IKA-235: Visual hierarchy for epic → story → task relationships.
 */
import { useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Clock,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useFeatureExpanded } from '@/stores/featureTreeStore';
import { StatusIcon } from '@/utils/StatusIcons';
import { format } from 'date-fns';
import type { EpicGroup } from '@/lib/epicGrouping';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

export interface EpicProgressCardProps {
  epic: EpicGroup;
  teamIdentifier?: string;
  onTaskClick?: (task: TaskWithAttemptStatus) => void;
}

const HEALTH_CONFIG = {
  'on-track': {
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'On Track',
  },
  'at-risk': {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'At Risk',
  },
  blocked: {
    icon: Ban,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    label: 'Blocked',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50',
    border: 'border-green-200',
    label: 'Completed',
  },
};

function getProgressColor(percentage: number): string {
  if (percentage === 0) return 'bg-gray-300';
  if (percentage < 30) return 'bg-red-500';
  if (percentage < 60) return 'bg-amber-500';
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

function sortTasks(tasks: TaskWithAttemptStatus[]): TaskWithAttemptStatus[] {
  const statusOrder: Record<TaskStatus, number> = {
    inprogress: 0,
    inreview: 1,
    todo: 2,
    done: 3,
    cancelled: 4,
  };
  return [...tasks].sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
}

export function EpicProgressCard({
  epic,
  teamIdentifier,
  onTaskClick,
}: EpicProgressCardProps) {
  const [isExpanded, toggle] = useFeatureExpanded(epic.epicId);
  const healthConfig = HEALTH_CONFIG[epic.healthStatus];
  const HealthIcon = healthConfig.icon;

  const progressColor = useMemo(
    () => getProgressColor(epic.percentage),
    [epic.percentage]
  );

  const handleToggle = useCallback(() => {
    toggle();
  }, [toggle]);

  const formattedDates = useMemo(() => {
    const start = epic.startDate
      ? format(epic.startDate, 'MMM d, yyyy')
      : 'Not started';
    const completed = epic.completedAt
      ? format(epic.completedAt, 'MMM d, yyyy')
      : null;
    return { start, completed };
  }, [epic.startDate, epic.completedAt]);

  return (
    <div
      data-testid="epic-progress-card"
      className={cn(
        'border rounded-lg overflow-hidden',
        epic.healthStatus === 'completed' && 'opacity-75'
      )}
    >
      {/* Epic Header */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 p-4 text-left',
          'hover:bg-muted/50 transition-colors',
          healthConfig.bg
        )}
      >
        {/* Expand/Collapse */}
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>

        {/* Epic Color */}
        <span
          className="w-4 h-4 rounded flex-shrink-0"
          style={{ backgroundColor: epic.epicColor }}
        />

        {/* Epic Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">
              {epic.epicName}
            </span>
            <Badge
              variant="outline"
              className={cn('text-xs', healthConfig.color, healthConfig.border)}
            >
              <HealthIcon className="h-3 w-3 mr-1" />
              {healthConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span>
              {epic.doneTasks}/{epic.totalTasks} tasks
            </span>
            {epic.completedAt && (
              <>
                <span>•</span>
                <span className="text-green-600">
                  Completed {formattedDates.completed}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all', progressColor)}
              style={{ width: `${epic.percentage}%` }}
            />
          </div>
          <span className="text-sm font-medium w-12 text-right">
            {epic.percentage}%
          </span>
        </div>
      </button>

      {/* Expanded Content - Tasks */}
      {isExpanded && (
        <div className="border-t bg-muted/10 p-2 space-y-1">
          {sortTasks(epic.stories[0]?.tasks || []).map((task) => (
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
