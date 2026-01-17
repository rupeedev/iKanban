import { useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusIcon } from '@/utils/StatusIcons';
import { useFeatureExpanded } from '@/stores/featureTreeStore';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

export interface FeatureTreeItemProps {
  /** Unique identifier for the feature (tag ID or 'untagged') */
  featureId: string;
  /** Display name of the feature */
  featureName: string;
  /** Optional color for the feature indicator (hex color) */
  featureColor?: string | null;
  /** Tasks belonging to this feature */
  tasks: TaskWithAttemptStatus[];
  /** Team identifier for issue key display (e.g., 'IKA') */
  teamIdentifier?: string;
}

interface TaskCounts {
  done: number;
  inProgress: number;
  todo: number;
  total: number;
  percentage: number;
}

function getTaskCounts(tasks: TaskWithAttemptStatus[]): TaskCounts {
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter(
    (t) => t.status === 'inprogress' || t.status === 'inreview'
  ).length;
  const todo = tasks.filter(
    (t) => t.status === 'todo' || t.status === 'cancelled'
  ).length;
  const total = tasks.length;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  return { done, inProgress, todo, total, percentage };
}

function getProgressBarColor(percentage: number): string {
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

export function FeatureTreeItem({
  featureId,
  featureName,
  featureColor,
  tasks,
  teamIdentifier,
}: FeatureTreeItemProps) {
  const [isExpanded, toggle] = useFeatureExpanded(featureId);

  const counts = useMemo(() => getTaskCounts(tasks), [tasks]);

  const progressBarColor = useMemo(
    () => getProgressBarColor(counts.percentage),
    [counts.percentage]
  );

  const handleToggle = useCallback(() => {
    toggle();
  }, [toggle]);

  // Sort tasks: in-progress first, then todo, then done
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const statusOrder: Record<TaskStatus, number> = {
        inprogress: 0,
        inreview: 1,
        todo: 2,
        done: 3,
        cancelled: 4,
      };
      return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    });
  }, [tasks]);

  return (
    <div data-testid="feature-tree-item" className="border rounded-lg">
      {/* Header - always visible */}
      <button
        data-testid="feature-item-header"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 p-3 text-left',
          'hover:bg-muted/50 transition-colors rounded-t-lg',
          !isExpanded && 'rounded-b-lg'
        )}
      >
        {/* Expand/Collapse icon */}
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        {/* Color indicator */}
        {featureColor && (
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: featureColor }}
          />
        )}

        {/* Feature name */}
        <span className="font-medium text-sm flex-1 truncate">
          {featureName}
        </span>

        {/* Task count badge */}
        <Badge variant="secondary" className="text-xs flex-shrink-0">
          {counts.done}/{counts.total}
        </Badge>

        {/* Progress bar */}
        <div className="w-24 flex-shrink-0 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all', progressBarColor)}
            style={{ width: `${counts.percentage}%` }}
          />
        </div>

        {/* Percentage */}
        <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">
          {counts.percentage}%
        </span>
      </button>

      {/* Expanded content - task list */}
      {isExpanded && (
        <div
          data-testid="feature-task-list"
          className="border-t px-3 py-2 bg-muted/20"
        >
          {sortedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tasks</p>
          ) : (
            <ul className="space-y-1">
              {sortedTasks.map((task) => {
                const issueKey = getIssueKey(teamIdentifier, task.issue_number);
                return (
                  <li
                    key={task.id}
                    className={cn(
                      'flex items-center gap-2 py-1.5 px-2 rounded-md',
                      'hover:bg-muted/50 transition-colors'
                    )}
                  >
                    <StatusIcon status={task.status} />
                    {issueKey && (
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {issueKey}
                      </span>
                    )}
                    <span className="text-sm truncate">{task.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
