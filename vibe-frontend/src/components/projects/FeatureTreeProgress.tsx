import { useMemo } from 'react';
import { Loader2, TagIcon } from 'lucide-react';
import { useBulkTaskTags } from '@/hooks/useBulkTaskTags';
import { FeatureTreeItem } from './FeatureTreeItem';
import type { TaskWithAttemptStatus, TaskTagWithDetails } from 'shared/types';

export interface FeatureTreeProgressProps {
  /** Tasks to group by tags */
  issues: TaskWithAttemptStatus[];
  /** Team identifier for issue key display */
  teamIdentifier?: string;
}

interface FeatureGroup {
  featureId: string;
  featureName: string;
  featureColor: string | null;
  tasks: TaskWithAttemptStatus[];
  doneCount: number;
  percentage: number;
}

/**
 * Groups tasks by their tags and calculates progress per group.
 * Tasks with multiple tags appear in multiple groups.
 * Tasks with no tags go into "Untagged" group.
 */
function groupTasksByTags(
  tasks: TaskWithAttemptStatus[],
  tagsMap: Map<string, TaskTagWithDetails[]>
): FeatureGroup[] {
  const groupMap = new Map<string, FeatureGroup>();
  const untaggedTasks: TaskWithAttemptStatus[] = [];

  // Iterate through all tasks and group by their tags
  for (const task of tasks) {
    const taskTags = tagsMap.get(task.id) ?? [];

    if (taskTags.length === 0) {
      // Task has no tags - add to untagged group
      untaggedTasks.push(task);
    } else {
      // Task has tags - add to each tag's group
      for (const tag of taskTags) {
        const existing = groupMap.get(tag.tag_id);
        if (existing) {
          existing.tasks.push(task);
        } else {
          groupMap.set(tag.tag_id, {
            featureId: tag.tag_id,
            featureName: tag.tag_name,
            featureColor: tag.color ?? null,
            tasks: [task],
            doneCount: 0,
            percentage: 0,
          });
        }
      }
    }
  }

  // Calculate stats for each group
  const groups = Array.from(groupMap.values()).map((group) => {
    const doneCount = group.tasks.filter((t) => t.status === 'done').length;
    const percentage =
      group.tasks.length > 0
        ? Math.round((doneCount / group.tasks.length) * 100)
        : 0;
    return { ...group, doneCount, percentage };
  });

  // Add untagged group if there are untagged tasks
  if (untaggedTasks.length > 0) {
    const doneCount = untaggedTasks.filter((t) => t.status === 'done').length;
    const percentage =
      untaggedTasks.length > 0
        ? Math.round((doneCount / untaggedTasks.length) * 100)
        : 0;
    groups.push({
      featureId: 'untagged',
      featureName: 'Untagged Tasks',
      featureColor: null,
      tasks: untaggedTasks,
      doneCount,
      percentage,
    });
  }

  // Sort groups: completed last, then by percentage descending, then alphabetically
  groups.sort((a, b) => {
    // Put 100% complete groups at the end
    const aComplete = a.percentage === 100;
    const bComplete = b.percentage === 100;
    if (aComplete !== bComplete) return aComplete ? 1 : -1;

    // Sort by percentage descending (higher progress first)
    if (a.percentage !== b.percentage) return b.percentage - a.percentage;

    // Alphabetically by name
    return a.featureName.localeCompare(b.featureName);
  });

  return groups;
}

export function FeatureTreeProgress({
  issues,
  teamIdentifier,
}: FeatureTreeProgressProps) {
  // Get all task IDs for bulk tag fetching
  const taskIds = useMemo(() => issues.map((i) => i.id), [issues]);

  // Fetch tags for all tasks in parallel
  const { tagsMap, isLoading, isError } = useBulkTaskTags(taskIds);

  // Group tasks by tags
  const featureGroups = useMemo(
    () => groupTasksByTags(issues, tagsMap),
    [issues, tagsMap]
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="feature-tree-progress"
        className="flex items-center justify-center py-8"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading feature progress...
        </span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        data-testid="feature-tree-progress"
        className="text-center py-8 text-muted-foreground"
      >
        <p className="text-sm">Failed to load feature progress.</p>
      </div>
    );
  }

  // Empty state - no tasks
  if (issues.length === 0) {
    return (
      <div
        data-testid="feature-tree-progress"
        className="flex flex-col items-center justify-center py-8 text-center"
      >
        <TagIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No tasks to show feature progress.
        </p>
      </div>
    );
  }

  // Empty state - all tasks untagged and no groups
  if (featureGroups.length === 0) {
    return (
      <div
        data-testid="feature-tree-progress"
        className="flex flex-col items-center justify-center py-8 text-center"
      >
        <TagIcon className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No features defined. Add tags to tasks to see feature progress.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="feature-tree-progress" className="space-y-2">
      {featureGroups.map((group) => (
        <FeatureTreeItem
          key={group.featureId}
          featureId={group.featureId}
          featureName={group.featureName}
          featureColor={group.featureColor}
          tasks={group.tasks}
          teamIdentifier={teamIdentifier}
        />
      ))}
    </div>
  );
}
