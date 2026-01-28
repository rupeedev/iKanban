import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity as ActivityIcon,
  CheckCircle2,
  MessageSquare,
  GitPullRequest,
  CircleDot,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewFilter = 'activity' | 'for-me' | 'popular' | 'recent';

interface ActivityItem {
  id: string;
  type: 'project_update' | 'issue_completed' | 'comment' | 'pr_merged';
  title: string;
  description?: string;
  project?: string;
  status?: string;
  author?: string;
  timestamp: Date;
}

// Placeholder activity data
const PLACEHOLDER_ACTIVITIES: ActivityItem[] = [];

const ACTIVITY_ICONS = {
  project_update: CircleDot,
  issue_completed: CheckCircle2,
  comment: MessageSquare,
  pr_merged: GitPullRequest,
};

export function Activity() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>('activity');

  // Group activities by date
  const groupActivitiesByDate = (activities: ActivityItem[]) => {
    const groups: { label: string; items: ActivityItem[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const todayItems = activities.filter(
      (a) => a.timestamp.toDateString() === today.toDateString()
    );
    const yesterdayItems = activities.filter(
      (a) => a.timestamp.toDateString() === yesterday.toDateString()
    );
    const lastWeekItems = activities.filter(
      (a) =>
        a.timestamp > lastWeek &&
        a.timestamp.toDateString() !== today.toDateString() &&
        a.timestamp.toDateString() !== yesterday.toDateString()
    );

    if (todayItems.length > 0)
      groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0)
      groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (lastWeekItems.length > 0)
      groups.push({ label: 'Last week', items: lastWeekItems });

    return groups;
  };

  const activityGroups = groupActivitiesByDate(PLACEHOLDER_ACTIVITIES);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ActivityIcon className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Activity</h1>
          </div>
          <Button variant="outline" size="sm" className="text-xs">
            Subscription
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 border-b px-6 py-2 flex items-center gap-2">
        <Button
          variant={viewFilter === 'activity' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewFilter('activity')}
          className="h-7 text-xs"
        >
          Activity
        </Button>
        <Button
          variant={viewFilter === 'for-me' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewFilter('for-me')}
          className="h-7 text-xs"
        >
          For me
        </Button>
        <Button
          variant={viewFilter === 'popular' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewFilter('popular')}
          className="h-7 text-xs"
        >
          Popular
        </Button>
        <Button
          variant={viewFilter === 'recent' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setViewFilter('recent')}
          className="h-7 text-xs"
        >
          Recent
        </Button>
      </div>

      {/* Activity feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activityGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Clock className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs mt-1">
              Activity from your workspace will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {activityGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-xs font-medium text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-4">
                  {group.items.map((item) => {
                    const Icon = ACTIVITY_ICONS[item.type] || CircleDot;
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">
                                {item.title}
                              </p>
                              {item.status && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'text-[10px] px-1.5 py-0',
                                    item.status === 'Project on track' &&
                                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  )}
                                >
                                  {item.status}
                                </Badge>
                              )}
                            </div>
                            {item.author && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.author}
                              </p>
                            )}
                            {item.description && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {item.timestamp.toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
