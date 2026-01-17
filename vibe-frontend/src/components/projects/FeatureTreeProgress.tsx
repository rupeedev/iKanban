import { useMemo } from 'react';
import { TagIcon } from 'lucide-react';
import { groupTasksByFeatures } from '@/lib/featureDetection';
import { FeatureTreeItem } from './FeatureTreeItem';
import type { TaskWithAttemptStatus } from 'shared/types';

export interface FeatureTreeProgressProps {
  /** Tasks to group by detected features */
  issues: TaskWithAttemptStatus[];
  /** Team identifier for issue key display */
  teamIdentifier?: string;
  /** Project ID for defensive filtering - ensures only project tasks are shown */
  projectId?: string;
}

/**
 * Feature Progress View using intelligent keyword-based detection.
 * IKA-113: Replaces tag-based grouping with keyword detection.
 *
 * Features:
 * - Automatic task categorization based on keywords in title/description
 * - Tasks can appear in multiple feature groups
 * - No API calls needed (pure function, instant rendering)
 * - Unmatched tasks go to "Other" category
 */
export function FeatureTreeProgress({
  issues,
  teamIdentifier,
  projectId,
}: FeatureTreeProgressProps) {
  // IKA-114: Defensive filter - ensures only project tasks are used even if parent passes unfiltered data
  const filteredIssues = useMemo(() => {
    if (!projectId) return issues;
    return issues.filter((issue) => issue.project_id === projectId);
  }, [issues, projectId]);

  // Group tasks by detected features (pure function, no API calls)
  const featureGroups = useMemo(
    () => groupTasksByFeatures(filteredIssues),
    [filteredIssues]
  );

  // Empty state - no tasks (use filteredIssues for accurate project-specific count)
  if (filteredIssues.length === 0) {
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
