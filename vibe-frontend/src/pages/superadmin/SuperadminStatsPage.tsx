import { useQuery } from '@tanstack/react-query';
import { superadminApi, TenantMetrics } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Users,
  FolderKanban,
  ClipboardList,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Hook to fetch tenant metrics
function useTenantMetrics() {
  return useQuery({
    queryKey: ['superadmin', 'tenants'],
    queryFn: () => superadminApi.getTenants(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Status badge component with appropriate colors
function StatusBadge({
  status,
  label,
}: {
  status: 'ok' | 'warning' | 'critical';
  label?: string;
}) {
  const statusConfig = {
    ok: {
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      icon: CheckCircle,
      text: label || 'OK',
    },
    warning: {
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: AlertTriangle,
      text: label || 'Near Limit',
    },
    critical: {
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: AlertCircle,
      text: label || 'At Limit',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge className={cn('gap-1', config.color)} variant="outline">
      <Icon className="h-3 w-3" />
      {config.text}
    </Badge>
  );
}

// Usage progress indicator
function UsageBar({
  current,
  max,
  status,
}: {
  current: number;
  max: number;
  status: 'ok' | 'warning' | 'critical';
}) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const unlimited = max <= 0;

  const barColors = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">
            <div className="flex items-center justify-between text-xs mb-1">
              <span>
                {current} / {unlimited ? 'Unlimited' : max}
              </span>
              {!unlimited && <span>{Math.round(percentage)}%</span>}
            </div>
            {!unlimited && (
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all', barColors[status])}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Using {current} of {unlimited ? 'unlimited' : max} ({unlimited ? 'unlimited' : `${Math.round(percentage)}%`})
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Summary cards at the top
function SummaryCards({
  summary,
}: {
  summary: {
    total_workspaces: number;
    total_teams: number;
    total_projects: number;
    total_members: number;
    total_issues: number;
    workspaces_at_limit: number;
    workspaces_near_limit: number;
  };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.total_workspaces}</div>
          <p className="text-xs text-muted-foreground">Active tenant workspaces</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Teams</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.total_teams}</div>
          <p className="text-xs text-muted-foreground">
            {summary.total_members} total members
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.total_projects}</div>
          <p className="text-xs text-muted-foreground">
            {summary.total_issues} total issues
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Limit Status</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {summary.workspaces_at_limit > 0 && (
              <Badge variant="destructive">{summary.workspaces_at_limit} at limit</Badge>
            )}
            {summary.workspaces_near_limit > 0 && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                {summary.workspaces_near_limit} near limit
              </Badge>
            )}
            {summary.workspaces_at_limit === 0 && summary.workspaces_near_limit === 0 && (
              <Badge variant="outline" className="bg-green-100 text-green-800">
                All OK
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Workspaces approaching limits
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Tenant table row
function TenantRow({ tenant }: { tenant: TenantMetrics }) {
  const createdDate = new Date(tenant.created_at).toLocaleDateString();

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{tenant.name}</span>
          <span className="text-xs text-muted-foreground">{tenant.slug}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{tenant.owner_name || tenant.owner_email || 'No owner'}</span>
          {tenant.owner_name && tenant.owner_email && (
            <span className="text-xs text-muted-foreground">{tenant.owner_email}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {tenant.plan}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="w-24">
          <UsageBar
            current={tenant.usage.teams_count}
            max={tenant.limits.max_teams}
            status={tenant.status.teams}
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="w-24">
          <UsageBar
            current={tenant.usage.projects_count}
            max={tenant.limits.max_projects}
            status={tenant.status.projects}
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="w-24">
          <UsageBar
            current={tenant.usage.members_count}
            max={tenant.limits.max_members}
            status={tenant.status.members}
          />
        </div>
      </TableCell>
      <TableCell className="text-center">{tenant.usage.issues_count}</TableCell>
      <TableCell className="text-center">{tenant.usage.documents_count}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{createdDate}</TableCell>
      <TableCell>
        <StatusBadge status={tenant.status.overall} />
      </TableCell>
    </TableRow>
  );
}

// Loading skeleton
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SuperadminStatsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useTenantMetrics();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">System Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive tenant workspace statistics and limit monitoring
          </p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">System Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive tenant workspace statistics and limit monitoring
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <p className="text-lg font-medium mb-2">Failed to load tenant metrics</p>
            <p className="text-sm text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, tenants } = data || {
    summary: {
      total_workspaces: 0,
      total_teams: 0,
      total_projects: 0,
      total_members: 0,
      total_issues: 0,
      workspaces_at_limit: 0,
      workspaces_near_limit: 0,
    },
    tenants: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">System Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive tenant workspace statistics and limit monitoring
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <SummaryCards summary={summary} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenant Workspaces ({tenants.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tenant workspaces found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Teams
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <FolderKanban className="h-3 w-3" />
                        Projects
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Members
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <ClipboardList className="h-3 w-3" />
                        Issues
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <FileText className="h-3 w-3" />
                        Docs
                      </div>
                    </TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TenantRow key={tenant.id} tenant={tenant} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
