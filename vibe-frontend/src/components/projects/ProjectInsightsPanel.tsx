import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Calendar,
  Clock,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ListChecks,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays, differenceInWeeks } from 'date-fns';
import type { Project, TaskWithAttemptStatus } from 'shared/types';
import { cn } from '@/lib/utils';

interface ProjectInsightsPanelProps {
  project: Project;
  issues: TaskWithAttemptStatus[];
  teamIdentifier?: string;
}

interface TimelineStats {
  startDate: Date | null;
  daysActive: number;
  targetDate: Date | null;
  daysRemaining: number | null;
  velocity: number;
}

function calculateTimelineStats(
  project: Project,
  issues: TaskWithAttemptStatus[]
): TimelineStats {
  // Find start date: earliest task created_at, or project created_at if no tasks
  let startDate: Date | null = null;
  if (issues.length > 0) {
    const earliestTask = issues.reduce((earliest, task) => {
      const taskDate = new Date(task.created_at);
      return !earliest || taskDate < earliest ? taskDate : earliest;
    }, null as Date | null);
    startDate = earliestTask;
  }

  if (!startDate && project.created_at) {
    startDate = new Date(project.created_at);
  }

  const now = new Date();
  const daysActive = startDate ? differenceInDays(now, startDate) : 0;

  // Target date from project
  const targetDate = project.target_date ? new Date(project.target_date) : null;
  const daysRemaining = targetDate ? differenceInDays(targetDate, now) : null;

  // Calculate velocity: completed tasks per week
  const completedCount = issues.filter((t) => t.status === 'done').length;
  const weeksActive = startDate ? Math.max(1, differenceInWeeks(now, startDate)) : 1;
  const velocity = weeksActive > 0 ? completedCount / weeksActive : 0;

  return {
    startDate,
    daysActive,
    targetDate,
    daysRemaining,
    velocity,
  };
}

function formatDateShort(date: Date | null): string {
  if (!date) return 'Not set';
  return format(date, 'MMM d, yyyy');
}

function getIssueKey(
  teamIdentifier: string | undefined,
  issueNumber: number | null | undefined
): string | null {
  if (!teamIdentifier || !issueNumber) return null;
  return `${teamIdentifier}-${issueNumber}`;
}

export function ProjectInsightsPanel({
  project,
  issues,
  teamIdentifier,
}: ProjectInsightsPanelProps) {
  const [showAllCompleted, setShowAllCompleted] = useState(false);

  // Calculate stats
  const stats = useMemo(() => {
    const total = issues.length;
    const done = issues.filter((i) => i.status === 'done').length;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percentage };
  }, [issues]);

  const timelineStats = useMemo(
    () => calculateTimelineStats(project, issues),
    [project, issues]
  );

  // Get completed tasks sorted by most recent
  const completedTasks = useMemo(() => {
    return issues
      .filter((i) => i.status === 'done')
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
  }, [issues]);

  const displayedCompletedTasks = showAllCompleted
    ? completedTasks
    : completedTasks.slice(0, 5);

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
          <ListChecks className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No insights yet</h3>
        <p className="text-sm text-muted-foreground">
          Create tasks for this project to see insights and progress tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <h2 className="text-lg font-semibold">Project Insights</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Progress Card */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{stats.done}</span>
                <span className="text-sm text-muted-foreground">
                  of {stats.total} tasks completed
                </span>
              </div>
              <Progress value={stats.percentage} className="h-2" />
              <div className="text-right text-sm font-medium text-muted-foreground">
                {stats.percentage}% complete
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline Card */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {/* Start Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Started
                </span>
                <span className="text-sm font-medium">
                  {formatDateShort(timelineStats.startDate)}
                </span>
              </div>

              {/* Days Active */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Days Active
                </span>
                <span className="text-sm font-medium">
                  {timelineStats.daysActive}{' '}
                  {timelineStats.daysActive === 1 ? 'day' : 'days'}
                </span>
              </div>

              {/* Target Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Target
                </span>
                <span className="text-sm font-medium">
                  {formatDateShort(timelineStats.targetDate)}
                </span>
              </div>

              {/* Days Remaining */}
              {timelineStats.daysRemaining !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Days Remaining
                  </span>
                  <Badge
                    variant={
                      timelineStats.daysRemaining < 0
                        ? 'destructive'
                        : timelineStats.daysRemaining <= 7
                          ? 'secondary'
                          : 'outline'
                    }
                    className="text-xs"
                  >
                    {timelineStats.daysRemaining < 0
                      ? `${Math.abs(timelineStats.daysRemaining)} days overdue`
                      : `${timelineStats.daysRemaining} days`}
                  </Badge>
                </div>
              )}

              {/* Velocity */}
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-sm text-muted-foreground">Velocity</span>
                <span className="text-sm font-medium">
                  ~{timelineStats.velocity.toFixed(1)} tasks/week
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completed Features */}
      <Card className="border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-green-500" />
              Completed Features
              <Badge variant="secondary" className="ml-1">
                {completedTasks.length}
              </Badge>
            </CardTitle>
            {completedTasks.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAllCompleted(!showAllCompleted)}
              >
                {showAllCompleted ? (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 mr-1" />
                    Show all {completedTasks.length}
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {completedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed tasks yet. Keep going!
            </p>
          ) : (
            <ul className="space-y-2">
              {displayedCompletedTasks.map((task) => {
                const issueKey = getIssueKey(teamIdentifier, task.issue_number);
                return (
                  <li
                    key={task.id}
                    className={cn(
                      'flex items-start gap-2 py-1.5 px-2 rounded-md',
                      'bg-green-500/5 border border-green-500/10'
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {issueKey && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {issueKey}
                          </span>
                        )}
                        <span className="text-sm truncate">{task.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Completed{' '}
                        {format(new Date(task.updated_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
