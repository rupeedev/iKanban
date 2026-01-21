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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFeatureExpanded } from '@/stores/featureTreeStore';
import { StoryTaskGroup } from './StoryTaskGroup';
import { format } from 'date-fns';
import type { EpicGroup } from '@/lib/epicGrouping';
import type { TaskWithAttemptStatus } from 'shared/types';

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
              {epic.stories.length}{' '}
              {epic.stories.length === 1 ? 'story' : 'stories'}
            </span>
            <span>•</span>
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

      {/* Expanded Content - Stories */}
      {isExpanded && (
        <div className="border-t bg-muted/10 divide-y">
          {epic.stories.map((story) => (
            <StoryTaskGroup
              key={story.storyId}
              story={story}
              teamIdentifier={teamIdentifier}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
