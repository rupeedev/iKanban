import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { superadminApi } from '@/lib/api';
import {
  UserCheck,
  Users,
  Clock,
  Building2,
  FolderKanban,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

// Hook to fetch tenant metrics for dashboard summary
function useDashboardMetrics() {
  return useQuery({
    queryKey: ['superadmin', 'tenants'],
    queryFn: () => superadminApi.getTenants(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function SuperadminDashboard() {
  const { data, isLoading, isError } = useDashboardMetrics();

  const summary = data?.summary || {
    total_workspaces: 0,
    total_teams: 0,
    total_projects: 0,
    total_members: 0,
    total_issues: 0,
    workspaces_at_limit: 0,
    workspaces_near_limit: 0,
  };

  // Get recent workspaces (last 5)
  const recentWorkspaces = data?.tenants?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Overview of registration requests and system status
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Requests
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Approved Today
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Registrations approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{summary.total_members}</div>
            )}
            <p className="text-xs text-muted-foreground">Active accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* System Metrics Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {summary.total_workspaces}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Tenant workspaces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Teams</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{summary.total_teams}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Across all workspaces
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{summary.total_projects}</div>
            )}
            <p className="text-xs text-muted-foreground">Active projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{summary.total_issues}</div>
            )}
            <p className="text-xs text-muted-foreground">Total tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Limit Status Alert */}
      {!isLoading &&
        (summary.workspaces_at_limit > 0 ||
          summary.workspaces_near_limit > 0) && (
          <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Limit Status Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {summary.workspaces_at_limit > 0 && (
                  <Badge variant="destructive">
                    {summary.workspaces_at_limit} workspace
                    {summary.workspaces_at_limit > 1 ? 's' : ''} at limit
                  </Badge>
                )}
                {summary.workspaces_near_limit > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  >
                    {summary.workspaces_near_limit} workspace
                    {summary.workspaces_near_limit > 1 ? 's' : ''} near limit
                  </Badge>
                )}
                <Link to="stats" className="ml-auto">
                  <Button variant="outline" size="sm">
                    View Details
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Recent Workspaces */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Workspaces</CardTitle>
          <Link to="stats">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">
              Failed to load recent workspaces.
            </p>
          ) : recentWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workspaces yet.</p>
          ) : (
            <div className="space-y-3">
              {recentWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <div className="font-medium">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {workspace.owner_email || 'No owner'} &middot;{' '}
                      {new Date(workspace.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {workspace.plan}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {workspace.usage.teams_count} teams &middot;{' '}
                      {workspace.usage.members_count} members
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
