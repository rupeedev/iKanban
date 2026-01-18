import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { TeamKanbanBoard } from '@/components/tasks/TeamKanbanBoard';
import { InsightsPanel } from '@/components/tasks/InsightsPanel';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors';

interface TeamProject {
  id: string;
  name: string;
}

interface TeamIssuesContentProps {
  hasIssues: boolean;
  hasFilteredIssues: boolean;
  hasActiveFilters: boolean;
  showInsights: boolean;
  issues: TaskWithAttemptStatus[];
  kanbanColumns: Record<
    TaskStatus,
    { task: TaskWithAttemptStatus; issueKey?: string; projectName?: string }[]
  >;
  teamMembers: TeamMember[];
  teamProjects: TeamProject[];
  onCreateIssue: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onViewIssueDetails: (issue: TaskWithAttemptStatus) => void;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onPriorityChange: (taskId: string, priority: number) => Promise<void>;
  onProjectChange: (taskId: string, newProjectId: string) => Promise<void>;
  onClearFilters: () => void;
  onCloseInsights: () => void;
}

export function TeamIssuesContent({
  hasIssues,
  hasFilteredIssues,
  hasActiveFilters,
  showInsights,
  issues,
  kanbanColumns,
  teamMembers,
  teamProjects,
  onCreateIssue,
  onDragEnd,
  onViewIssueDetails,
  onAssigneeChange,
  onPriorityChange,
  onProjectChange,
  onClearFilters,
  onCloseInsights,
}: TeamIssuesContentProps) {
  return (
    <div className="h-full overflow-auto">
      {!hasIssues ? (
        <div className="max-w-7xl mx-auto mt-8 px-4">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No issues in this team yet</p>
              <Button className="mt-4" onClick={onCreateIssue}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Issue
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : !hasFilteredIssues && hasActiveFilters ? (
        <div className="max-w-7xl mx-auto mt-8 px-4">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">
                No issues match your filters
              </p>
              <Button variant="outline" className="mt-4" onClick={onClearFilters}>
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain p-4">
          <TeamKanbanBoard
            columns={kanbanColumns}
            onDragEnd={onDragEnd}
            onViewTaskDetails={onViewIssueDetails}
            onCreateTask={onCreateIssue}
            selectedTaskId={undefined}
            teamMembers={teamMembers}
            teamProjects={teamProjects}
            onAssigneeChange={onAssigneeChange}
            onPriorityChange={onPriorityChange}
            onProjectChange={onProjectChange}
          />
        </div>
      )}

      {/* Insights Panel */}
      {showInsights && (
        <InsightsPanel issues={issues} onClose={onCloseInsights} />
      )}
    </div>
  );
}
