/**
 * Epic/Story Dashboard - Main container with summary stats and epic cards.
 * IKA-235: Clear visual hierarchy for epic → story → task relationships.
 *
 * Features:
 * - Summary stats bar (Total Tasks, Done, % Complete, At-Risk)
 * - Epic cards with progress and health indicators
 * - Collapsible story groups within each epic
 * - Task list with completion dates
 */
import { useMemo, useCallback, useState } from 'react';
import {
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useFeatureTreeStore } from '@/stores/featureTreeStore';
import { EpicProgressCard } from './EpicProgressCard';
import {
  groupTasksByEpicAndStory,
  calculateDashboardStats,
} from '@/lib/epicGrouping';
import type { TaskWithAttemptStatus } from 'shared/types';

export interface EpicStoryDashboardProps {
  tasks: TaskWithAttemptStatus[];
  teamIdentifier?: string;
  projectId?: string;
  onTaskClick?: (task: TaskWithAttemptStatus) => void;
}

export function EpicStoryDashboard({
  tasks,
  teamIdentifier,
  projectId,
  onTaskClick,
}: EpicStoryDashboardProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const { clear: collapseAll } = useFeatureTreeStore();

  // Filter tasks by project if provided
  const filteredTasks = useMemo(() => {
    if (!projectId) return tasks;
    return tasks.filter((task) => task.project_id === projectId);
  }, [tasks, projectId]);

  // Group tasks by epic and story
  const epicGroups = useMemo(
    () => groupTasksByEpicAndStory(filteredTasks),
    [filteredTasks]
  );

  // Filter out completed epics if toggle is off
  const visibleEpics = useMemo(() => {
    if (showCompleted) return epicGroups;
    return epicGroups.filter((epic) => epic.healthStatus !== 'completed');
  }, [epicGroups, showCompleted]);

  // Calculate dashboard stats
  const stats = useMemo(
    () => calculateDashboardStats(epicGroups),
    [epicGroups]
  );

  const completedEpicCount = useMemo(
    () => epicGroups.filter((e) => e.healthStatus === 'completed').length,
    [epicGroups]
  );

  const handleExpandAll = useCallback(() => {
    // Expand all epics and stories
    const { expandFeature } = useFeatureTreeStore.getState();
    for (const epic of epicGroups) {
      expandFeature(epic.epicId);
      for (const story of epic.stories) {
        expandFeature(story.storyId);
      }
    }
  }, [epicGroups]);

  const handleCollapseAll = useCallback(() => {
    collapseAll();
  }, [collapseAll]);

  const handleToggleCompleted = useCallback(() => {
    setShowCompleted((prev) => !prev);
  }, []);

  // Empty state
  if (filteredTasks.length === 0) {
    return (
      <div
        data-testid="epic-story-dashboard"
        className="flex flex-col items-center justify-center h-64 p-8 text-center"
      >
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
        <p className="text-sm text-muted-foreground">
          Create tasks to see epic and story progress tracking.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="epic-story-dashboard" className="p-4 space-y-4">
      {/* Summary Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Tasks"
          value={stats.totalTasks}
          icon={<LayoutGrid className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          label="Completed"
          value={stats.doneTasks}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        />
        <StatCard
          label="Progress"
          value={`${stats.percentage}%`}
          icon={
            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-green-500" />
          }
        />
        <StatCard
          label="At Risk"
          value={stats.atRiskCount}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          highlight={stats.atRiskCount > 0}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {visibleEpics.length} of {stats.epicCount} features
          </span>
          {completedEpicCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleCompleted}
              className="h-7 text-xs gap-1"
            >
              {showCompleted ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide Completed
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Show Completed ({completedEpicCount})
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="h-7 text-xs gap-1"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="h-7 text-xs gap-1"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Collapse All
          </Button>
        </div>
      </div>

      {/* Epic Cards */}
      <div className="space-y-3">
        {visibleEpics.map((epic) => (
          <EpicProgressCard
            key={epic.epicId}
            epic={epic}
            teamIdentifier={teamIdentifier}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      {/* No visible features message */}
      {visibleEpics.length === 0 && epicGroups.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
          <p className="text-sm">All features are completed!</p>
          <Button
            variant="link"
            size="sm"
            onClick={handleToggleCompleted}
            className="mt-2"
          >
            Show completed features
          </Button>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  return (
    <Card
      className={cn(
        'border',
        highlight && 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'
      )}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
