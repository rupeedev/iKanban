import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CircleDot,
  Clock,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Minus,
} from 'lucide-react';

import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { cn } from '@/lib/utils';

import type { TaskWithAttemptStatus, Team } from 'shared/types';

// Priority icons and colors
export const PRIORITY_CONFIG: Record<
  number,
  { icon: typeof AlertCircle; color: string; label: string }
> = {
  1: { icon: AlertCircle, color: 'text-red-500', label: 'Urgent' },
  2: { icon: ArrowUp, color: 'text-orange-500', label: 'High' },
  3: { icon: ArrowRight, color: 'text-yellow-500', label: 'Medium' },
  4: { icon: ArrowDown, color: 'text-blue-500', label: 'Low' },
  0: { icon: Minus, color: 'text-muted-foreground', label: 'None' },
};

// Component to fetch and display issues for a single team
export function TeamIssuesLoader({
  teamId,
  userMemberId,
  onIssuesLoaded,
}: {
  teamId: string;
  userMemberId: string | null;
  onIssuesLoaded: (teamId: string, issues: TaskWithAttemptStatus[]) => void;
}) {
  const { issues } = useTeamIssues(teamId);

  // Filter to user's assigned issues and call parent callback
  useEffect(() => {
    if (userMemberId) {
      const userIssues = issues.filter(
        (issue) => issue.assignee_id === userMemberId
      );
      onIssuesLoaded(teamId, userIssues);
    }
  }, [issues, userMemberId, teamId, onIssuesLoaded]);

  return null;
}

// Filter tab component
export function FilterTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CircleDot;
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={cn(
        'gap-2 transition-all',
        active
          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
          : 'hover:bg-muted',
        highlight &&
          !active &&
          count > 0 &&
          'text-yellow-600 dark:text-yellow-400'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <Badge
        variant={active ? 'outline' : 'secondary'}
        className={cn(
          'rounded-full h-5 min-w-[20px] px-1.5',
          active && 'bg-white/20 text-white border-white/30'
        )}
      >
        {count}
      </Badge>
    </Button>
  );
}

// Helper component to load team member ID and then issues
export function TeamMemberIssueLoader({
  teamId,
  userEmail,
  onIssuesLoaded,
}: {
  teamId: string;
  userEmail: string;
  onIssuesLoaded: (teamId: string, issues: TaskWithAttemptStatus[]) => void;
}) {
  const { members } = useTeamMembers(teamId);

  // Find current user's member ID in this team
  const userMemberId = useMemo(() => {
    const member = members.find((m) => m.email === userEmail);
    return member?.id ?? null;
  }, [members, userEmail]);

  return (
    <TeamIssuesLoader
      teamId={teamId}
      userMemberId={userMemberId}
      onIssuesLoaded={onIssuesLoaded}
    />
  );
}

// Issue card component
export function IssueCard({
  issue,
  teams,
  selected,
  onClick,
}: {
  issue: TaskWithAttemptStatus & { teamId: string };
  teams: Team[];
  selected?: boolean;
  onClick: () => void;
}) {
  const team = teams.find((t) => t.id === issue.teamId);
  const issueKey =
    team && issue.issue_number != null
      ? `${team.identifier || team.name.slice(0, 3).toUpperCase()}-${issue.issue_number}`
      : undefined;

  const priority = issue.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[0];
  const PriorityIcon = priorityConfig.icon;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 group',
        'hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800',
        'border-l-4',
        issue.status === 'inprogress' && 'border-l-yellow-500',
        issue.status === 'inreview' && 'border-l-blue-500',
        issue.status === 'todo' && 'border-l-gray-300 dark:border-l-gray-600',
        issue.status === 'done' && 'border-l-green-500',
        selected && 'ring-2 ring-indigo-500 border-indigo-300 dark:border-indigo-700'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Top row: Issue key + Team badge */}
            <div className="flex items-center gap-2 mb-2">
              {issueKey && (
                <code className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">
                  {issueKey}
                </code>
              )}
              {team && (
                <Badge variant="outline" className="text-xs font-normal gap-1">
                  {team.icon && <span>{team.icon}</span>}
                  {team.name}
                </Badge>
              )}
              {priority > 0 && priority <= 2 && (
                <PriorityIcon
                  className={cn('h-4 w-4 ml-auto', priorityConfig.color)}
                />
              )}
            </div>

            {/* Title */}
            <h3 className="font-medium line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {issue.title}
            </h3>

            {/* Description */}
            {issue.description && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                {issue.description}
              </p>
            )}

            {/* Bottom row: metadata */}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(issue.created_at).toLocaleDateString()}
              </span>
              {priority > 0 && (
                <span
                  className={cn(
                    'flex items-center gap-1',
                    priorityConfig.color
                  )}
                >
                  <PriorityIcon className="h-3 w-3" />
                  {priorityConfig.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
