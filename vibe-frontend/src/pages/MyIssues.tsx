import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  RefreshCw,
  Circle,
  PlayCircle,
  CircleDot,
  ListTodo,
  CheckCircle2,
} from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

import { useClerkUser } from '@/hooks/auth/useClerkAuth';
import { useTeams } from '@/hooks/useTeams';
import { StatusIcon } from '@/utils/StatusIcons';
import { cn } from '@/lib/utils';
import { IssueDetailPanel } from '@/components/tasks/IssueDetailPanel';
import {
  loadIssuePanelSize,
  saveIssuePanelSize,
  PANEL_DEFAULTS,
} from '@/lib/panelStorage';
import {
  FilterTab,
  TeamMemberIssueLoader,
  IssueCard,
} from './my-issues/MyIssueComponents';

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

type ViewFilter = 'all' | 'active' | 'backlog' | 'done';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'text-gray-500',
  inprogress: 'text-yellow-500',
  inreview: 'text-blue-500',
  done: 'text-green-500',
  cancelled: 'text-red-500',
};

export function MyIssues() {
  const { user } = useClerkUser();
  const { teams, teamsById, isLoading: teamsLoading, error: teamsError } = useTeams();
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [allIssues, setAllIssues] = useState<
    Record<string, TaskWithAttemptStatus[]>
  >({});

  // Issue detail panel state
  const [selectedIssue, setSelectedIssue] = useState<(TaskWithAttemptStatus & { teamId: string }) | null>(null);
  const [issuePanelSize, setIssuePanelSize] = useState<number>(loadIssuePanelSize);

  // Get current user email from Clerk (reliable source)
  const userEmail = user?.primaryEmailAddress?.emailAddress || null;

  // Get display name for header from Clerk
  const userName = useMemo(() => {
    if (!user) return null;
    return (
      user.fullName || user.firstName || userEmail?.split('@')[0] || 'User'
    );
  }, [user, userEmail]);

  // Handle issues loaded from each team
  const handleIssuesLoaded = useCallback(
    (teamId: string, issues: TaskWithAttemptStatus[]) => {
      setAllIssues((prev) => ({
        ...prev,
        [teamId]: issues,
      }));
    },
    []
  );

  // Aggregate all issues from all teams
  const aggregatedIssues = useMemo(() => {
    const allIssuesList: Array<TaskWithAttemptStatus & { teamId: string }> = [];
    Object.entries(allIssues).forEach(([teamId, issues]) => {
      issues.forEach((issue) => {
        allIssuesList.push({ ...issue, teamId });
      });
    });
    return allIssuesList;
  }, [allIssues]);

  // Count by filter type
  const counts = useMemo(
    () => ({
      all: aggregatedIssues.length,
      active: aggregatedIssues.filter((i) =>
        ['inprogress', 'inreview'].includes(i.status)
      ).length,
      backlog: aggregatedIssues.filter((i) => i.status === 'todo').length,
      done: aggregatedIssues.filter((i) => i.status === 'done').length,
    }),
    [aggregatedIssues]
  );

  // Apply view filter
  const filteredIssues = useMemo(() => {
    let result = aggregatedIssues;

    if (viewFilter === 'active') {
      result = result.filter((i) =>
        ['inprogress', 'inreview'].includes(i.status)
      );
    } else if (viewFilter === 'backlog') {
      result = result.filter((i) => i.status === 'todo');
    } else if (viewFilter === 'done') {
      result = result.filter((i) => i.status === 'done');
    }

    // Sort: active issues by priority, then by created_at
    return result.sort((a, b) => {
      // Active issues first, sorted by priority
      if (a.status !== 'done' && b.status !== 'done') {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityA !== priorityB) {
          // Lower priority number = higher priority (1 is urgent)
          return (priorityA || 5) - (priorityB || 5);
        }
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [aggregatedIssues, viewFilter]);

  // Group by status for display
  const issuesByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, typeof filteredIssues> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    filteredIssues.forEach((issue) => {
      grouped[issue.status]?.push(issue);
    });

    return grouped;
  }, [filteredIssues]);

  const handleRefresh = useCallback(() => {
    setAllIssues({});
    setSelectedIssue(null);
  }, []);

  // Open issue detail panel instead of navigating
  const handleIssueClick = useCallback(
    (issue: TaskWithAttemptStatus & { teamId: string }) => {
      setSelectedIssue(issue);
    },
    []
  );

  // Handle panel resize
  const handlePanelResize = useCallback((sizes: number[]) => {
    if (
      sizes.length === 2 &&
      sizes[1] >= PANEL_DEFAULTS.ISSUE_PANEL_MIN &&
      sizes[1] <= PANEL_DEFAULTS.ISSUE_PANEL_MAX
    ) {
      setIssuePanelSize(sizes[1]);
      saveIssuePanelSize(sizes[1]);
    }
  }, []);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIssue) {
        setSelectedIssue(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssue]);

  // Generate issue key for selected issue
  const selectedIssueKey = useMemo(() => {
    if (!selectedIssue || selectedIssue.issue_number == null) return undefined;
    const team = teamsById[selectedIssue.teamId];
    if (!team) return undefined;
    const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
    return `${prefix}-${selectedIssue.issue_number}`;
  }, [selectedIssue, teamsById]);

  if (teamsLoading) {
    return <Loader message="Loading teams..." size={32} className="py-8" />;
  }

  if (teamsError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Error
          </AlertTitle>
          <AlertDescription>
            {teamsError.message || 'Failed to load teams'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Not signed in
          </AlertTitle>
          <AlertDescription>
            Please sign in to view your issues.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasIssues = filteredIssues.length > 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Load issues from each team using team members to find current user */}
      {teams.map((team) => (
        <TeamMemberIssueLoader
          key={team.id}
          teamId={team.id}
          userEmail={userEmail}
          onIssuesLoaded={handleIssuesLoaded}
        />
      ))}

      {/* Header */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950">
              <ListTodo className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">My Issues</h1>
              {userName && (
                <p className="text-sm text-muted-foreground">{userName}</p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 border-b bg-muted/30 px-6 py-3">
        <div className="flex items-center gap-2 max-w-6xl mx-auto">
          <FilterTab
            active={viewFilter === 'all'}
            onClick={() => setViewFilter('all')}
            icon={CircleDot}
            label="All"
            count={counts.all}
          />
          <FilterTab
            active={viewFilter === 'active'}
            onClick={() => setViewFilter('active')}
            icon={PlayCircle}
            label="Active"
            count={counts.active}
            highlight
          />
          <FilterTab
            active={viewFilter === 'backlog'}
            onClick={() => setViewFilter('backlog')}
            icon={Circle}
            label="Backlog"
            count={counts.backlog}
          />
          <FilterTab
            active={viewFilter === 'done'}
            onClick={() => setViewFilter('done')}
            icon={CheckCircle2}
            label="Done"
            count={counts.done}
          />
        </div>
      </div>

      {/* Content with resizable panel for issue details */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full"
          onLayout={handlePanelResize}
        >
          {/* Main content area */}
          <ResizablePanel
            defaultSize={selectedIssue ? 100 - issuePanelSize : 100}
            minSize={40}
            className="min-w-0"
          >
            <div className="h-full overflow-auto">
              <div className="max-w-6xl mx-auto p-6">
                {!hasIssues ? (
                  <Card className="border-dashed">
                    <CardContent className="text-center py-12">
                      <div className="p-4 rounded-full bg-muted inline-block mb-4">
                        <ListTodo className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium mb-1">No issues found</h3>
                      <p className="text-sm text-muted-foreground">
                        {viewFilter === 'all'
                          ? 'When you get assigned to issues, they will appear here'
                          : `No ${viewFilter} issues assigned to you`}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-8">
                    {/* Render issues grouped by status */}
                    {(['inprogress', 'inreview', 'todo', 'done'] as TaskStatus[]).map(
                      (status) => {
                        const statusIssues = issuesByStatus[status];
                        if (statusIssues.length === 0) return null;

                        return (
                          <div key={status}>
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                              <StatusIcon
                                status={status}
                                className={cn('h-5 w-5', STATUS_COLORS[status])}
                              />
                              <h2 className="font-medium">{STATUS_LABELS[status]}</h2>
                              <Badge variant="secondary" className="rounded-full">
                                {statusIssues.length}
                              </Badge>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                              {statusIssues.map((issue) => (
                                <IssueCard
                                  key={issue.id}
                                  issue={issue}
                                  teams={teams}
                                  selected={selectedIssue?.id === issue.id}
                                  onClick={() => handleIssueClick(issue)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          {/* Issue Detail Panel with resize handle */}
          {selectedIssue && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                defaultSize={issuePanelSize}
                minSize={25}
                maxSize={60}
                className="min-w-0"
              >
                <IssueDetailPanel
                  issue={selectedIssue}
                  teamId={selectedIssue.teamId}
                  issueKey={selectedIssueKey}
                  onClose={() => setSelectedIssue(null)}
                  onUpdate={async () => {
                    // Refresh the issues list by clearing and reloading
                    setAllIssues({});
                  }}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
