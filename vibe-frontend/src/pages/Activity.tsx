import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity as ActivityIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pause,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePulse } from '@/hooks/usePulse';
import type {
  ProjectUpdate,
  PulseFilter,
  ProjectHealthStatus,
} from 'shared/types';

type ViewFilter = 'activity' | 'for-me' | 'popular' | 'recent';

// Map view filter to API filter
const VIEW_TO_API_FILTER: Record<ViewFilter, PulseFilter> = {
  activity: 'recent',
  'for-me': 'for_me',
  popular: 'popular',
  recent: 'recent',
};

// Health status icons and styling
const HEALTH_STATUS_CONFIG: Record<
  ProjectHealthStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  on_track: {
    icon: CheckCircle2,
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'On Track',
  },
  at_risk: {
    icon: AlertTriangle,
    className:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    label: 'At Risk',
  },
  off_track: {
    icon: XCircle,
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Off Track',
  },
  completed: {
    icon: CheckCircle2,
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Completed',
  },
  paused: {
    icon: Pause,
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
    label: 'Paused',
  },
};

export function Activity() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>('activity');
  const apiFilter = VIEW_TO_API_FILTER[viewFilter];
  const { updates, isLoading, error } = usePulse(apiFilter);

  // Group updates by date
  const updateGroups = useMemo(() => {
    const groups: { label: string; items: ProjectUpdate[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const todayItems = updates.filter(
      (u) => new Date(u.created_at).toDateString() === today.toDateString()
    );
    const yesterdayItems = updates.filter(
      (u) => new Date(u.created_at).toDateString() === yesterday.toDateString()
    );
    const lastWeekItems = updates.filter((u) => {
      const date = new Date(u.created_at);
      return (
        date > lastWeek &&
        date.toDateString() !== today.toDateString() &&
        date.toDateString() !== yesterday.toDateString()
      );
    });
    const olderItems = updates.filter((u) => {
      const date = new Date(u.created_at);
      return date <= lastWeek;
    });

    if (todayItems.length > 0)
      groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0)
      groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (lastWeekItems.length > 0)
      groups.push({ label: 'Last week', items: lastWeekItems });
    if (olderItems.length > 0)
      groups.push({ label: 'Older', items: olderItems });

    return groups;
  }, [updates]);

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
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm">Loading activity...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4 text-destructive opacity-50" />
            <p className="text-sm font-medium">Failed to load activity</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        ) : updateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Clock className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">No recent activity</p>
            <p className="text-xs mt-1">
              Activity from your workspace will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {updateGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-xs font-medium text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-4">
                  {group.items.map((update) => {
                    const healthConfig = update.health_status
                      ? HEALTH_STATUS_CONFIG[update.health_status]
                      : null;
                    const HealthIcon = healthConfig?.icon || ActivityIcon;
                    const createdAt = new Date(update.created_at);

                    return (
                      <div
                        key={update.id}
                        className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'mt-0.5 p-1.5 rounded-full',
                              healthConfig?.className || 'bg-muted'
                            )}
                          >
                            <HealthIcon
                              className={cn(
                                'h-3.5 w-3.5',
                                healthConfig ? '' : 'text-muted-foreground'
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium line-clamp-1">
                                Project Update
                              </p>
                              {healthConfig && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'text-[10px] px-1.5 py-0',
                                    healthConfig.className
                                  )}
                                >
                                  {healthConfig.label}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                              {update.content}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {createdAt.toLocaleTimeString(undefined, {
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
