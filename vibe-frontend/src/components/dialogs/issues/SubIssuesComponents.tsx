import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

// Status filter options for Epic management
export type StatusFilter = 'all' | TaskStatus;

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'inprogress', label: 'In Progress' },
  { value: 'inreview', label: 'In Review' },
  { value: 'done', label: 'Done' },
];

// Priority order for smart sorting (active work first)
export const STATUS_PRIORITY: Record<TaskStatus, number> = {
  todo: 0,
  inprogress: 1,
  inreview: 2,
  done: 3,
  cancelled: 4,
};

// Status badge colors
export const statusColors: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  inprogress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  inreview:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

interface StatusFilterTabsProps {
  statusFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

export function StatusFilterTabs({
  statusFilter,
  onFilterChange,
}: StatusFilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {STATUS_FILTERS.map((filter) => (
        <Button
          key={filter.value}
          variant={statusFilter === filter.value ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => onFilterChange(filter.value)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}

interface AvailableIssuesListProps {
  issues: TaskWithAttemptStatus[];
  selectedIds: Set<string>;
  isMutating: boolean;
  searchQuery: string;
  statusFilter: StatusFilter;
  getIssueKey: (issue: TaskWithAttemptStatus) => string;
  onToggleSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onLinkIssue: (issue: TaskWithAttemptStatus) => void;
  onBulkLink: () => void;
}

export function AvailableIssuesList({
  issues,
  selectedIds,
  isMutating,
  searchQuery,
  statusFilter,
  getIssueKey,
  onToggleSelection,
  onToggleSelectAll,
  onLinkIssue,
  onBulkLink,
}: AvailableIssuesListProps) {
  if (issues.length === 0) return null;

  const headerLabel = searchQuery.trim()
    ? 'Search Results'
    : statusFilter !== 'all'
      ? `${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label} Issues`
      : 'Available Issues';

  const allSelected = issues.every((i) => selectedIds.has(i.id));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">
          {headerLabel}
          <span className="ml-1">({issues.length})</span>
        </h4>
        {issues.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onToggleSelectAll}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
        )}
      </div>
      <div className="border rounded-md max-h-64 overflow-y-auto">
        {issues.map((issue) => {
          const isSelected = selectedIds.has(issue.id);
          return (
            <div
              key={issue.id}
              className={cn(
                'w-full px-3 py-2 flex items-center gap-2',
                'border-b last:border-b-0 hover:bg-muted transition-colors',
                isSelected && 'bg-muted/50',
                isMutating && 'opacity-50'
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection(issue.id)}
                disabled={isMutating}
                className="h-4 w-4"
              />
              <button
                onClick={() => onLinkIssue(issue)}
                disabled={isMutating}
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                <span className="text-muted-foreground text-xs font-mono shrink-0">
                  {getIssueKey(issue)}
                </span>
                <span className="flex-1 truncate text-sm">{issue.title}</span>
              </button>
              <Badge
                variant="secondary"
                className={cn('text-xs shrink-0', statusColors[issue.status])}
              >
                {issue.status}
              </Badge>
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <Button
          onClick={onBulkLink}
          disabled={isMutating}
          className="w-full mt-2"
          size="sm"
        >
          {isMutating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Link {selectedIds.size} Selected Issue{selectedIds.size > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}

interface LinkedSubIssuesListProps {
  subIssues: TaskWithAttemptStatus[];
  isLoading: boolean;
  isMutating: boolean;
  getIssueKey: (issue: TaskWithAttemptStatus) => string;
  onUnlink: (id: string) => void;
}

export function LinkedSubIssuesList({
  subIssues,
  isLoading,
  isMutating,
  getIssueKey,
  onUnlink,
}: LinkedSubIssuesListProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">
        Linked Sub-issues ({subIssues.length})
      </h4>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : subIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            No sub-issues linked yet
          </p>
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {subIssues.map((issue) => (
            <div key={issue.id} className="px-3 py-2 flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-mono">
                {getIssueKey(issue)}
              </span>
              <span className="flex-1 truncate text-sm">{issue.title}</span>
              <Badge
                variant="secondary"
                className={cn('text-xs', statusColors[issue.status])}
              >
                {issue.status}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onUnlink(issue.id)}
                disabled={isMutating}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
