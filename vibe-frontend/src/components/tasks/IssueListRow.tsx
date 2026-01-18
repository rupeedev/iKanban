import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { StatusIcon } from '@/utils/StatusIcons';
import {
  PrioritySelector,
  type TeamMember,
  type PriorityValue,
} from '@/components/selectors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, X, Check } from 'lucide-react';

interface TeamProject {
  id: string;
  name: string;
}

interface IssueListRowProps {
  task: TaskWithAttemptStatus;
  status: TaskStatus;
  issueKey?: string;
  projectName?: string;
  projectId?: string;
  onViewDetails: (task: TaskWithAttemptStatus) => void;
  isSelected?: boolean;
  teamMembers?: TeamMember[];
  teamProjects?: TeamProject[];
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => Promise<void>;
  onPriorityChange?: (taskId: string, priority: number) => Promise<void>;
  onProjectChange?: (taskId: string, projectId: string) => Promise<void>;
}

function IssueListRowComponent({
  task,
  status,
  issueKey,
  projectName,
  projectId,
  onViewDetails,
  isSelected,
  teamMembers = [],
  teamProjects = [],
  onAssigneeChange,
  onPriorityChange,
  onProjectChange,
}: IssueListRowProps) {
  const handleClick = useCallback(() => {
    onViewDetails(task);
  }, [task, onViewDetails]);

  const handleAssigneeChange = useCallback(
    (assigneeId: string | null) => {
      onAssigneeChange?.(task.id, assigneeId);
    },
    [task.id, onAssigneeChange]
  );

  const handlePriorityChange = useCallback(
    (priority: PriorityValue) => {
      onPriorityChange?.(task.id, priority);
    },
    [task.id, onPriorityChange]
  );

  const handleProjectChange = useCallback(
    (newProjectId: string) => {
      onProjectChange?.(task.id, newProjectId);
    },
    [task.id, onProjectChange]
  );

  // Get assigned member info
  const selectedMember = task.assignee_id
    ? teamMembers.find((m) => m.id === task.assignee_id)
    : undefined;
  const hasAssigneeAvatar = !!selectedMember?.avatar;

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const hasAssignee = !!task.assignee_id;
  const assigneeInitials = selectedMember
    ? getInitials(selectedMember.name)
    : hasAssignee
      ? task.assignee_id!.slice(0, 2).toUpperCase()
      : null;

  const priorityValue = (task.priority ?? 0) as PriorityValue;

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        'hover:bg-accent/30 border-b border-border/30 last:border-b-0',
        isSelected && 'bg-accent/50 ring-1 ring-inset ring-primary/50'
      )}
    >
      {/* More Actions */}
      <button
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100"
      >
        <MoreHorizontalIcon />
      </button>

      {/* Issue Key */}
      <span className="text-xs text-muted-foreground font-mono font-medium w-16 shrink-0">
        {issueKey || task.id.slice(0, 8).toUpperCase()}
      </span>

      {/* Status Icon */}
      <StatusIcon status={status} className="shrink-0" />

      {/* Title - takes remaining space */}
      <span className="flex-1 text-sm truncate min-w-0">{task.title}</span>

      {/* Project Label */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            disabled={!onProjectChange || teamProjects.length === 0}
          >
            <button
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                'bg-muted/50 border border-border/50',
                'transition-colors hover:bg-accent/50 hover:border-border',
                projectName
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-muted-foreground'
              )}
              title={projectName || 'Select project'}
            >
              <ProjectIcon />
              <span className="max-w-24 truncate">{projectName || 'Project'}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {teamProjects.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No projects available
              </DropdownMenuItem>
            ) : (
              teamProjects.map((project) => {
                const isCurrentProject = project.id === projectId;
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleProjectChange(project.id)}
                    className={cn(
                      'cursor-pointer gap-2',
                      isCurrentProject && 'bg-accent'
                    )}
                  >
                    <ProjectIcon className="text-indigo-500" />
                    <span className="flex-1 truncate">{project.name}</span>
                    {isCurrentProject && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Priority Selector */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <PrioritySelector
          value={priorityValue}
          onChange={handlePriorityChange}
          variant="pill"
          disabled={!onPriorityChange}
        />
      </div>

      {/* Assignee Selector */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!onAssigneeChange}>
            <button
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center overflow-hidden',
                'border border-dashed border-muted-foreground/40',
                'text-muted-foreground hover:border-primary hover:text-primary',
                'transition-colors text-xs font-medium',
                hasAssignee &&
                  !hasAssigneeAvatar &&
                  'border-solid bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
                hasAssigneeAvatar && 'border-none p-0'
              )}
              title={
                selectedMember
                  ? selectedMember.name
                  : hasAssignee
                    ? `Assigned: ${task.assignee_id}`
                    : 'Assign'
              }
            >
              {hasAssigneeAvatar ? (
                <img
                  src={selectedMember!.avatar}
                  alt={selectedMember!.name}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : assigneeInitials ? (
                assigneeInitials
              ) : (
                <User className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() => handleAssigneeChange(null)}
              className={cn('cursor-pointer gap-2', !task.assignee_id && 'bg-accent')}
            >
              <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                <X className="h-3 w-3 text-muted-foreground" />
              </div>
              <span>No assignee</span>
            </DropdownMenuItem>

            {teamMembers.length > 0 && <DropdownMenuSeparator />}

            {teamMembers.map((member) => {
              const memberSelected = task.assignee_id === member.id;
              return (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => handleAssigneeChange(member.id)}
                  className={cn('cursor-pointer gap-2', memberSelected && 'bg-accent')}
                >
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-medium">
                    {getInitials(member.name)}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate">{member.name}</span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0L14.928 4v8L8 16 1.072 12V4L8 0z" fillOpacity="0.3" />
      <path d="M8 2l5.196 3v6L8 14 2.804 11V5L8 2z" />
    </svg>
  );
}

export const IssueListRow = memo(IssueListRowComponent);
