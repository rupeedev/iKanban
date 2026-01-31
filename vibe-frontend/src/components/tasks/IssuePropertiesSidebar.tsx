import { useMemo } from 'react';
import { Circle, ChevronDown, User, Tag, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import {
  PrioritySelector,
  type PriorityValue,
} from '@/components/selectors/PrioritySelector';
import { TaskTagsSection } from '@/components/tags/TaskTagsSection';

interface IssuePropertiesSidebarProps {
  issue: TaskWithAttemptStatus;
  teamId?: string;
  teamMembers?: Array<{
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  }>;
  teamProjects?: Array<{ id: string; name: string }>;
  onStatusChange?: (status: TaskStatus) => Promise<void>;
  onPriorityChange?: (priority: PriorityValue) => Promise<void>;
  onAssigneeChange?: (assigneeId: string | null) => Promise<void>;
  onProjectChange?: (projectId: string) => Promise<void>;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: 'Backlog', color: 'text-gray-500' },
  { value: 'inprogress', label: 'In Progress', color: 'text-yellow-500' },
  { value: 'inreview', label: 'In Review', color: 'text-blue-500' },
  { value: 'done', label: 'Done', color: 'text-green-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-red-500' },
];

export function IssuePropertiesSidebar({
  issue,
  teamId,
  teamMembers = [],
  teamProjects = [],
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onProjectChange,
}: IssuePropertiesSidebarProps) {
  const currentStatus =
    STATUS_OPTIONS.find((s) => s.value === issue.status) || STATUS_OPTIONS[0];

  const currentAssignee = useMemo(() => {
    if (!issue.assignee_id) return null;
    return teamMembers.find((m) => m.id === issue.assignee_id);
  }, [issue.assignee_id, teamMembers]);

  const currentProject = useMemo(() => {
    if (!issue.project_id) return null;
    return teamProjects.find((p) => p.id === issue.project_id);
  }, [issue.project_id, teamProjects]);

  return (
    <div className="w-[280px] border-l bg-background flex flex-col shrink-0">
      <div className="p-4 border-b">
        <h3 className="text-sm font-medium text-muted-foreground">
          Properties
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Circle className="h-3 w-3" />
            Status
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between h-9"
                disabled={!onStatusChange}
              >
                <span
                  className={cn('flex items-center gap-2', currentStatus.color)}
                >
                  <Circle className="h-3 w-3 fill-current" />
                  {currentStatus.label}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              {STATUS_OPTIONS.map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => onStatusChange?.(status.value)}
                  className={cn('flex items-center gap-2', status.color)}
                >
                  <Circle className="h-3 w-3 fill-current" />
                  {status.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Priority
          </label>
          <PrioritySelector
            value={(issue.priority || 0) as PriorityValue}
            onChange={(p) => onPriorityChange?.(p)}
            disabled={!onPriorityChange}
          />
        </div>

        {/* Assignee */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <User className="h-3 w-3" />
            Assignee
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between h-9"
                disabled={!onAssigneeChange}
              >
                <span className="flex items-center gap-2 truncate">
                  {currentAssignee ? (
                    <>
                      {currentAssignee.avatar ? (
                        <img
                          src={currentAssignee.avatar}
                          alt={currentAssignee.name}
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs">
                          {currentAssignee.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{currentAssignee.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              <DropdownMenuItem
                onClick={() => onAssigneeChange?.(null)}
                className="text-muted-foreground"
              >
                Unassigned
              </DropdownMenuItem>
              {teamMembers.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => onAssigneeChange?.(member.id)}
                  className="flex items-center gap-2"
                >
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="h-5 w-5 rounded-full"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate">{member.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Labels/Tags */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Tag className="h-3 w-3" />
            Labels
          </label>
          <TaskTagsSection taskId={issue.id} teamId={teamId} editable />
        </div>

        {/* Project */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="h-3 w-3" />
            Project
          </label>
          {teamProjects.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between h-9"
                  disabled={!onProjectChange}
                >
                  <span className="truncate">
                    {currentProject?.name || 'No project'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                {teamProjects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => onProjectChange?.(project.id)}
                    className={cn(
                      project.id === issue.project_id && 'bg-accent'
                    )}
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              No project
            </Badge>
          )}
        </div>

        {/* Dates */}
        <div className="pt-4 border-t space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Created</span>
            <p className="text-sm">
              {new Date(issue.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Updated</span>
            <p className="text-sm">
              {new Date(issue.updated_at).toLocaleDateString()}
            </p>
          </div>
          {issue.due_date && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Due Date</span>
              <p className="text-sm">
                {new Date(issue.due_date).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
