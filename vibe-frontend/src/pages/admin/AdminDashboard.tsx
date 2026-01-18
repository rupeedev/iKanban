import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  Mail,
  Clock,
  Building2,
  ArrowUpRight,
  UserPlus,
  Shield,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAdminStats, useAdminActivity } from '@/hooks/useAdmin';
import { AdminActivity } from '@/lib/api';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
  isLoading?: boolean;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'user_joined':
      return <UserPlus className="h-4 w-4 text-green-500" />;
    case 'invitation_sent':
      return <Mail className="h-4 w-4 text-blue-500" />;
    case 'role_changed':
      return <Shield className="h-4 w-4 text-purple-500" />;
    case 'invitation_expired':
      return <Clock className="h-4 w-4 text-orange-500" />;
    default:
      return <Users className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityMessage(activity: AdminActivity) {
  switch (activity.activity_type) {
    case 'user_joined':
      return (
        <>
          <span className="font-medium">{activity.user_email}</span> joined the
          workspace
        </>
      );
    case 'invitation_sent':
      return (
        <>
          <span className="font-medium">{activity.user_email || 'Admin'}</span>{' '}
          invited <span className="font-medium">{activity.target_email}</span>
        </>
      );
    case 'role_changed':
      return (
        <>
          <span className="font-medium">{activity.user_email}</span> role
          changed
          {activity.from_role && activity.to_role && (
            <>
              {' '}
              from{' '}
              <Badge variant="outline" className="mx-1">
                {activity.from_role}
              </Badge>{' '}
              to{' '}
              <Badge variant="outline" className="mx-1">
                {activity.to_role}
              </Badge>
            </>
          )}
        </>
      );
    case 'invitation_expired':
      return (
        <>
          Invitation to{' '}
          <span className="font-medium">{activity.target_email}</span> expired
        </>
      );
    default:
      return <span className="text-muted-foreground">Activity recorded</span>;
  }
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-4 w-4 rounded-full mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminDashboard() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useAdminStats(currentWorkspaceId ?? undefined);
  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = useAdminActivity(currentWorkspaceId ?? undefined);

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {(statsError || activitiesError) && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load admin data
              </p>
              <p className="text-sm text-muted-foreground">
                {statsError?.message ||
                  activitiesError?.message ||
                  'Please try again later'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats?.total_users ?? 0}
          icon={Users}
          description="in this workspace"
          isLoading={statsLoading}
        />
        <StatCard
          title="Active Users"
          value={stats?.active_users ?? 0}
          icon={Users}
          description="currently active"
          isLoading={statsLoading}
        />
        <StatCard
          title="Pending Invitations"
          value={stats?.pending_invitations ?? 0}
          icon={Mail}
          description="awaiting response"
          isLoading={statsLoading}
        />
        <StatCard
          title="Teams"
          value={stats?.total_teams ?? 0}
          icon={Building2}
          description="in this workspace"
          isLoading={statsLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions in the workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {activitiesLoading ? (
              <ActivitySkeleton />
            ) : activities && activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getActivityIcon(activity.activity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{getActivityMessage(activity)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/admin/invitations">
                <UserPlus className="h-4 w-4 mr-2" />
                Send Invitation
                <ArrowUpRight className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/admin/users">
                <Users className="h-4 w-4 mr-2" />
                Manage Users
                <ArrowUpRight className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/admin/permissions">
                <Shield className="h-4 w-4 mr-2" />
                Configure Permissions
                <ArrowUpRight className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to="/admin/configuration">
                <Settings className="h-4 w-4 mr-2" />
                System Settings
                <ArrowUpRight className="h-3 w-3 ml-auto" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <CardDescription>Current system status and health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  statsError ? 'bg-red-500' : 'bg-green-500'
                )}
              />
              <div>
                <p className="text-sm font-medium">API Status</p>
                <p className="text-xs text-muted-foreground">
                  {statsError ? 'Connection issues' : 'All systems operational'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">Database</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">Workspace</p>
                <p className="text-xs text-muted-foreground">
                  {stats ? `${stats.total_users} members` : 'Loading...'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
