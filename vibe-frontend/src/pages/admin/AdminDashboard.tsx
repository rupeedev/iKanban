import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Mail,
  Clock,
  Building2,
  ArrowUpRight,
  UserPlus,
  Shield,
  Settings,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Mock data for UI development
const mockStats = {
  totalUsers: 156,
  totalUsersTrend: 12,
  activeInvitations: 8,
  activeInvitationsTrend: -2,
  pendingApprovals: 3,
  pendingApprovalsTrend: 1,
  workspaces: 24,
  workspacesTrend: 4,
};

const mockRecentActivity = [
  { id: '1', type: 'user_joined', user: 'john.doe@example.com', timestamp: '2 minutes ago' },
  { id: '2', type: 'invitation_sent', user: 'admin@company.com', target: 'newuser@example.com', timestamp: '15 minutes ago' },
  { id: '3', type: 'role_changed', user: 'jane.smith@example.com', from: 'member', to: 'admin', timestamp: '1 hour ago' },
  { id: '4', type: 'user_joined', user: 'mike.wilson@example.com', timestamp: '2 hours ago' },
  { id: '5', type: 'invitation_expired', target: 'old.invite@example.com', timestamp: '5 hours ago' },
];

interface StatCardProps {
  title: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  description: string;
}

function StatCard({ title, value, trend, icon: Icon, description }: StatCardProps) {
  const isPositive = trend >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        <div className="flex items-center gap-1 mt-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-green-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
          <span className={cn('text-xs', isPositive ? 'text-green-500' : 'text-red-500')}>
            {isPositive ? '+' : ''}{trend}
          </span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
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

function getActivityMessage(activity: typeof mockRecentActivity[0]) {
  switch (activity.type) {
    case 'user_joined':
      return <><span className="font-medium">{activity.user}</span> joined the platform</>;
    case 'invitation_sent':
      return <><span className="font-medium">{activity.user}</span> invited {activity.target}</>;
    case 'role_changed':
      return <><span className="font-medium">{activity.user}</span> role changed from <Badge variant="outline" className="mx-1">{activity.from}</Badge> to <Badge variant="outline" className="mx-1">{activity.to}</Badge></>;
    case 'invitation_expired':
      return <>Invitation to <span className="font-medium">{activity.target}</span> expired</>;
    default:
      return 'Unknown activity';
  }
}

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={mockStats.totalUsers}
          trend={mockStats.totalUsersTrend}
          icon={Users}
          description="this month"
        />
        <StatCard
          title="Active Invitations"
          value={mockStats.activeInvitations}
          trend={mockStats.activeInvitationsTrend}
          icon={Mail}
          description="pending"
        />
        <StatCard
          title="Pending Approvals"
          value={mockStats.pendingApprovals}
          trend={mockStats.pendingApprovalsTrend}
          icon={Clock}
          description="awaiting review"
        />
        <StatCard
          title="Workspaces"
          value={mockStats.workspaces}
          trend={mockStats.workspacesTrend}
          icon={Building2}
          description="this month"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockRecentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{getActivityMessage(activity)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
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
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">API Status</p>
                <p className="text-xs text-muted-foreground">All systems operational</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">Database</p>
                <p className="text-xs text-muted-foreground">Connected, 24ms latency</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium">Storage</p>
                <p className="text-xs text-muted-foreground">72% capacity available</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
