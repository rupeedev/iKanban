import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { StatusIcon } from '@/utils/StatusIcons';
import { statusLabels } from '@/utils/statusLabels';
import { IssueListRow } from './IssueListRow';
import type { TeamMember } from '@/components/selectors';

interface TeamProject {
  id: string;
  name: string;
}

interface ColumnItem {
  task: TaskWithAttemptStatus;
  issueKey?: string;
  projectName?: string;
  projectId?: string;
}

interface IssueListViewProps {
  columns: Record<TaskStatus, ColumnItem[]>;
  onViewIssueDetails: (task: TaskWithAttemptStatus) => void;
  onCreateIssue?: () => void;
  selectedIssueId?: string;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (
    taskId: string,
    assigneeId: string | null
  ) => Promise<void>;
  onPriorityChange?: (taskId: string, priority: number) => Promise<void>;
  onProjectChange?: (taskId: string, newProjectId: string) => Promise<void>;
}

const STATUS_ORDER: TaskStatus[] = [
  'inprogress',
  'todo',
  'inreview',
  'done',
  'cancelled',
];

interface StatusGroupProps {
  status: TaskStatus;
  items: ColumnItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onViewIssueDetails: (task: TaskWithAttemptStatus) => void;
  onCreateIssue?: () => void;
  selectedIssueId?: string;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (
    taskId: string,
    assigneeId: string | null
  ) => Promise<void>;
  onPriorityChange?: (taskId: string, priority: number) => Promise<void>;
  onProjectChange?: (taskId: string, newProjectId: string) => Promise<void>;
}

function StatusGroup({
  status,
  items,
  isExpanded,
  onToggle,
  onViewIssueDetails,
  onCreateIssue,
  selectedIssueId,
  teamMembers,
  teamProjects,
  onAssigneeChange,
  onPriorityChange,
  onProjectChange,
}: StatusGroupProps) {
  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Group Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-accent/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <StatusIcon status={status} className="shrink-0" />
        <span className="font-medium text-sm">{statusLabels[status]}</span>
        <span className="text-sm text-muted-foreground">{items.length}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onCreateIssue?.();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </button>

      {/* Group Items */}
      {isExpanded && items.length > 0 && (
        <div className="bg-background">
          {items.map((item) => (
            <IssueListRow
              key={item.task.id}
              task={item.task}
              status={status}
              issueKey={item.issueKey}
              projectName={item.projectName}
              projectId={item.projectId || item.task.project_id}
              onViewDetails={onViewIssueDetails}
              isSelected={selectedIssueId === item.task.id}
              teamMembers={teamMembers}
              teamProjects={teamProjects}
              onAssigneeChange={onAssigneeChange}
              onPriorityChange={onPriorityChange}
              onProjectChange={onProjectChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueListViewComponent({
  columns,
  onViewIssueDetails,
  onCreateIssue,
  selectedIssueId,
  teamMembers,
  teamProjects,
  onAssigneeChange,
  onPriorityChange,
  onProjectChange,
}: IssueListViewProps) {
  // Track expanded state for each status group
  const [expandedGroups, setExpandedGroups] = useState<
    Record<TaskStatus, boolean>
  >({
    inprogress: true,
    todo: true,
    inreview: true,
    done: true,
    cancelled: false,
  });

  const toggleGroup = useCallback((status: TaskStatus) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  }, []);

  // Filter out empty groups (optional: show empty groups with count 0)
  const visibleStatuses = STATUS_ORDER.filter(
    (status) => columns[status]?.length > 0
  );

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-0">
        {visibleStatuses.map((status) => (
          <StatusGroup
            key={status}
            status={status}
            items={columns[status] || []}
            isExpanded={expandedGroups[status]}
            onToggle={() => toggleGroup(status)}
            onViewIssueDetails={onViewIssueDetails}
            onCreateIssue={onCreateIssue}
            selectedIssueId={selectedIssueId}
            teamMembers={teamMembers}
            teamProjects={teamProjects}
            onAssigneeChange={onAssigneeChange}
            onPriorityChange={onPriorityChange}
            onProjectChange={onProjectChange}
          />
        ))}

        {visibleStatuses.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No issues to display
          </div>
        )}
      </div>
    </div>
  );
}

export const IssueListView = memo(IssueListViewComponent);
