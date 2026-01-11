import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search,
  MoreVertical,
  Eye,
  Shield,
  Ban,
  CheckCircle,
  Trash2,
  Filter,
  Users,
  Crown,
  Pencil,
  Clock,
  Mail,
  Building2,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type UserStatus = 'active' | 'suspended' | 'pending';
type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
  lastActiveAt: string;
  workspaces: number;
  teams: number;
}

// Mock data for UI development
const mockUsers: User[] = [
  { id: '1', name: 'John Doe', email: 'john.doe@example.com', avatar: '', role: 'owner', status: 'active', joinedAt: '2024-01-01T10:00:00Z', lastActiveAt: '2024-01-11T14:30:00Z', workspaces: 3, teams: 5 },
  { id: '2', name: 'Jane Smith', email: 'jane.smith@example.com', avatar: '', role: 'admin', status: 'active', joinedAt: '2024-01-05T09:00:00Z', lastActiveAt: '2024-01-11T12:15:00Z', workspaces: 2, teams: 4 },
  { id: '3', name: 'Mike Wilson', email: 'mike.wilson@example.com', avatar: '', role: 'member', status: 'active', joinedAt: '2024-01-08T11:30:00Z', lastActiveAt: '2024-01-10T18:45:00Z', workspaces: 1, teams: 2 },
  { id: '4', name: 'Sarah Jones', email: 'sarah.jones@example.com', avatar: '', role: 'member', status: 'suspended', joinedAt: '2024-01-02T14:00:00Z', lastActiveAt: '2024-01-05T10:00:00Z', workspaces: 1, teams: 1 },
  { id: '5', name: 'Alex Brown', email: 'alex.brown@example.com', avatar: '', role: 'viewer', status: 'active', joinedAt: '2024-01-09T16:20:00Z', lastActiveAt: '2024-01-11T09:30:00Z', workspaces: 1, teams: 3 },
  { id: '6', name: 'Emily Davis', email: 'emily.davis@example.com', avatar: '', role: 'admin', status: 'active', joinedAt: '2024-01-03T08:45:00Z', lastActiveAt: '2024-01-11T16:00:00Z', workspaces: 2, teams: 6 },
  { id: '7', name: 'Chris Taylor', email: 'chris.taylor@example.com', avatar: '', role: 'member', status: 'pending', joinedAt: '2024-01-10T13:00:00Z', lastActiveAt: '2024-01-10T13:00:00Z', workspaces: 0, teams: 0 },
  { id: '8', name: 'Lisa Anderson', email: 'lisa.anderson@example.com', avatar: '', role: 'member', status: 'active', joinedAt: '2024-01-06T10:30:00Z', lastActiveAt: '2024-01-09T15:20:00Z', workspaces: 1, teams: 2 },
];

function getStatusBadge(status: UserStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
    case 'suspended':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><Ban className="h-3 w-3 mr-1" />Suspended</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRoleIcon(role: UserRole) {
  switch (role) {
    case 'owner':
      return <Crown className="h-4 w-4 text-yellow-600" />;
    case 'admin':
      return <Shield className="h-4 w-4 text-purple-600" />;
    case 'member':
      return <Users className="h-4 w-4 text-blue-600" />;
    case 'viewer':
      return <Eye className="h-4 w-4 text-gray-600" />;
    default:
      return null;
  }
}

function getRoleBadge(role: UserRole) {
  const colors: Record<UserRole, string> = {
    owner: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <Badge className={cn('capitalize flex items-center gap-1', colors[role])}>
      {getRoleIcon(role)}
      {role}
    </Badge>
  );
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

function getAvatarColor(str: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-cyan-500',
  ];
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

interface UserDetailsDialogProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
}

function UserDetailsDialog({ user, open, onClose }: UserDetailsDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>View and manage user information</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* User header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className={getAvatarColor(user.email)}>
                {user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex gap-2 mt-1">
                {getRoleBadge(user.role)}
                {getStatusBadge(user.status)}
              </div>
            </div>
          </div>

          {/* User stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{user.workspaces}</p>
                <p className="text-xs text-muted-foreground">Workspaces</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{user.teams}</p>
                <p className="text-xs text-muted-foreground">Teams</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{formatDate(user.joinedAt)}</p>
                <p className="text-xs text-muted-foreground">Joined</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{formatRelativeDate(user.lastActiveAt)}</p>
                <p className="text-xs text-muted-foreground">Last active</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1">
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
            {user.status === 'active' ? (
              <Button variant="outline" className="flex-1 text-orange-600">
                <Ban className="h-4 w-4 mr-2" />
                Suspend
              </Button>
            ) : (
              <Button variant="outline" className="flex-1 text-green-600">
                <CheckCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredUsers = mockUsers.filter((user) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!user.name.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Role filter
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;

    // Status filter
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;

    return true;
  });

  const openUserDetails = (user: User) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const closeUserDetails = () => {
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const userCounts = {
    total: mockUsers.length,
    active: mockUsers.filter((u) => u.status === 'active').length,
    suspended: mockUsers.filter((u) => u.status === 'suspended').length,
    pending: mockUsers.filter((u) => u.status === 'pending').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">Manage all platform users</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{userCounts.total}</div>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">{userCounts.active}</div>
          <p className="text-sm text-muted-foreground">Active</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-600">{userCounts.suspended}</div>
          <p className="text-sm text-muted-foreground">Suspended</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">{userCounts.pending}</div>
          <p className="text-sm text-muted-foreground">Pending</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>User</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Workspaces</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
              <TableHeaderCell>Last Active</TableHeaderCell>
              <TableHeaderCell className="w-12"></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id} className="cursor-pointer" onClick={() => openUserDetails(user)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className={getAvatarColor(user.email)}>
                        {user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{getRoleBadge(user.role)}</TableCell>
                <TableCell>{getStatusBadge(user.status)}</TableCell>
                <TableCell>
                  <span className="text-sm">{user.workspaces} workspace{user.workspaces !== 1 ? 's' : ''}</span>
                </TableCell>
                <TableCell className="text-sm">{formatDate(user.joinedAt)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatRelativeDate(user.lastActiveAt)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openUserDetails(user)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit role
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.status === 'active' ? (
                        <DropdownMenuItem className="text-orange-600">
                          <Ban className="h-4 w-4 mr-2" />
                          Suspend user
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-green-600">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Activate user
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove user
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No users found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        )}
      </Card>

      {/* User Details Dialog */}
      <UserDetailsDialog user={selectedUser} open={isDialogOpen} onClose={closeUserDetails} />
    </div>
  );
}
