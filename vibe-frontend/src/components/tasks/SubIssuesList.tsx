import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Folder, User, Loader2 } from 'lucide-react';
import { teamsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors/AssigneeSelector';

// Status options with colors
const STATUSES: {
  value: TaskStatus;
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
}[] = [
  {
    value: 'todo',
    label: 'Todo',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-700 dark:text-gray-300',
  },
  {
    value: 'inprogress',
    label: 'In Progress',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-700 dark:text-yellow-300',
  },
  {
    value: 'inreview',
    label: 'In Review',
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-300',
  },
  {
    value: 'done',
    label: 'Done',
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-300',
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
  },
];

interface SubIssuesListProps {
  issueId: string;
  teamId: string;
  teamPrefix?: string;
  teamMembers?: TeamMember[];
  teamProjects?: Array<{ id: string; name: string }>;
  onIssueClick?: (issue: TaskWithAttemptStatus) => void;
}

export function SubIssuesList({
  issueId,
  teamId,
  teamPrefix = '',
  teamMembers = [],
  teamProjects = [],
  onIssueClick,
}: SubIssuesListProps) {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const {
    data: subIssues = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['subIssues', teamId, issueId],
    queryFn: () => teamsApi.getSubIssues(teamId, issueId),
    enabled: !!teamId && !!issueId,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      childIssueId,
      data,
    }: {
      childIssueId: string;
      data: { status?: string; assignee_id?: string | null };
    }) => teamsApi.updateIssue(teamId, childIssueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['subIssues', teamId, issueId],
      });
      queryClient.invalidateQueries({ queryKey: ['teamIssues', teamId] });
    },
    onSettled: () => {
      setUpdatingId(null);
    },
  });

  const handleStatusChange = useCallback(
    async (childIssue: TaskWithAttemptStatus, newStatus: TaskStatus) => {
      if (childIssue.status === newStatus) return;
      setUpdatingId(childIssue.id);
      await updateMutation.mutateAsync({
        childIssueId: childIssue.id,
        data: { status: newStatus },
      });
    },
    [updateMutation]
  );

  const handleAssigneeChange = useCallback(
    async (childIssue: TaskWithAttemptStatus, newAssigneeId: string | null) => {
      if (childIssue.assignee_id === newAssigneeId) return;
      setUpdatingId(childIssue.id);
      await updateMutation.mutateAsync({
        childIssueId: childIssue.id,
        data: { assignee_id: newAssigneeId },
      });
    },
    [updateMutation]
  );

  const getIssueKey = useCallback(
    (issue: TaskWithAttemptStatus) => {
      if (!issue.issue_number) return '';
      return teamPrefix
        ? `${teamPrefix}-${issue.issue_number}`
        : `#${issue.issue_number}`;
    },
    [teamPrefix]
  );

  const getStatusConfig = (status: TaskStatus) => {
    return STATUSES.find((s) => s.value === status) || STATUSES[0];
  };

  const getAssignee = (assigneeId: string | null | undefined) => {
    if (!assigneeId) return null;
    return teamMembers.find((m) => m.id === assigneeId);
  };

  const getProject = (projectId: string | null | undefined) => {
    if (!projectId) return null;
    return teamProjects.find((p) => p.id === projectId);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2 p-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return null;
  }

  // Empty state - don't show anything, the parent handles the add button
  if (subIssues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Sub-issues ({subIssues.length})
      </div>
      <div className="border rounded-md divide-y">
        {subIssues.map((issue) => {
          const statusConfig = getStatusConfig(issue.status);
          const assignee = getAssignee(issue.assignee_id);
          const project = getProject(issue.project_id);
          const isUpdating = updatingId === issue.id;

          return (
            <div
              key={issue.id}
              className={cn(
                'px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors',
                isUpdating && 'opacity-60'
              )}
            >
              {/* Issue key & title */}
              <button
                onClick={() => onIssueClick?.(issue)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                disabled={isUpdating}
              >
                <span className="text-muted-foreground text-xs font-mono shrink-0">
                  {getIssueKey(issue)}
                </span>
                <span className="truncate text-sm">{issue.title}</span>
              </button>

              {/* Project */}
              {project && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 gap-1 max-w-24"
                      >
                        <Folder className="h-3 w-3" />
                        <span className="truncate">{project.name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Project: {project.name}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Tags/Labels - placeholder for future implementation when tags API exists */}

              {/* Status dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={isUpdating}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-xs gap-1.5 shrink-0',
                      statusConfig.bgColor,
                      statusConfig.textColor
                    )}
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          statusConfig.dotColor
                        )}
                      />
                    )}
                    {statusConfig.label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {STATUSES.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onClick={() => handleStatusChange(issue, s.value)}
                      className={cn(
                        'gap-2 cursor-pointer text-xs',
                        issue.status === s.value && 'bg-accent'
                      )}
                    >
                      <div className={cn('h-2 w-2 rounded-full', s.dotColor)} />
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Assignee dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={isUpdating}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                  >
                    {assignee ? (
                      assignee.avatar ? (
                        <img
                          src={assignee.avatar}
                          alt={assignee.name}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center">
                          {getInitials(assignee.name)}
                        </div>
                      )
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => handleAssigneeChange(issue, null)}
                    className={cn(
                      'gap-2 cursor-pointer text-xs',
                      !issue.assignee_id && 'bg-accent'
                    )}
                  >
                    <div className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    Unassigned
                  </DropdownMenuItem>
                  {teamMembers.map((member) => (
                    <DropdownMenuItem
                      key={member.id}
                      onClick={() => handleAssigneeChange(issue, member.id)}
                      className={cn(
                        'gap-2 cursor-pointer text-xs',
                        issue.assignee_id === member.id && 'bg-accent'
                      )}
                    >
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center">
                          {getInitials(member.name)}
                        </div>
                      )}
                      <span className="truncate">{member.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
