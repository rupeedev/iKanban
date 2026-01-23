import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAdminUsers, useAdminUserMutations } from '@/hooks/useAdmin';
import { AdminUser } from '@/lib/api';
import { toast } from 'sonner';

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case 'suspended':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <Ban className="h-3 w-3 mr-1" />
          Suspended
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRoleIcon(role: string) {
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

function getRoleBadge(role: string) {
  const colors: Record<string, string> = {
    owner:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    admin:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <Badge
      className={cn('capitalize flex items-center gap-1', colors[role] || '')}
    >
      {getRoleIcon(role)}
      {role}
    </Badge>
  );
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
  onUpdateStatus: (status: string) => void;
  onUpdateRole: (role: string) => void;
  isUpdating: boolean;
}

function UserDetailsDialog({
  user,
  open,
  onClose,
  onUpdateStatus,
  onUpdateRole,
  isUpdating,
}: UserDetailsDialogProps) {
  if (!user) return null;

  const displayName =
    user.display_name || user.email?.split('@')[0] || 'Unknown';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            View and manage user information
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* User header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url} />
              <AvatarFallback className={getAvatarColor(user.email)}>
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{displayName}</h3>
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
                <p className="text-sm font-medium">
                  {formatDate(user.joined_at)}
                </p>
                <p className="text-xs text-muted-foreground">Joined</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium capitalize">{user.role}</p>
                <p className="text-xs text-muted-foreground">Role</p>
              </div>
            </div>
          </div>

          {/* Role change */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Change Role</label>
            <Select
              value={user.role}
              onValueChange={onUpdateRole}
              disabled={isUpdating || user.role === 'owner'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            {user.role === 'owner' && (
              <p className="text-xs text-muted-foreground">
                Owner role cannot be changed
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled>
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
            {user.status === 'active' ? (
              <Button
                variant="outline"
                className="flex-1 text-orange-600"
                onClick={() => onUpdateStatus('suspended')}
                disabled={isUpdating || user.role === 'owner'}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Suspend
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 text-green-600"
                onClick={() => onUpdateStatus('active')}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Activate
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function AdminUsers() {
  const { currentWorkspaceId } = useWorkspace();
  const {
    data: users,
    isLoading,
    error,
  } = useAdminUsers(currentWorkspaceId ?? undefined);
  const {
    updateStatus,
    updateRole,
    removeUser,
    isUpdatingStatus,
    isUpdatingRole,
    isRemoving,
  } = useAdminUserMutations(currentWorkspaceId ?? undefined);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<AdminUser | null>(null);

  const filteredUsers = (users || []).filter((user) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const displayName = user.display_name || user.email;
      if (
        !displayName.toLowerCase().includes(query) &&
        !user.email.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Role filter
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;

    // Status filter
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;

    return true;
  });

  const openUserDetails = (user: AdminUser) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const closeUserDetails = () => {
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedUser) return;
    try {
      await updateStatus(selectedUser.id, status);
      toast.success(
        `User ${status === 'active' ? 'activated' : 'suspended'} successfully`
      );
      closeUserDetails();
    } catch (err) {
      toast.error('Failed to update user status');
    }
  };

  const handleUpdateRole = async (role: string) => {
    if (!selectedUser) return;
    try {
      await updateRole(selectedUser.id, role);
      toast.success('User role updated successfully');
      closeUserDetails();
    } catch (err) {
      toast.error('Failed to update user role');
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemove) return;
    try {
      await removeUser(userToRemove.id);
      toast.success('User removed from workspace');
      setUserToRemove(null);
    } catch (err) {
      toast.error('Failed to remove user');
    }
  };

  const userCounts = {
    total: users?.length ?? 0,
    active: users?.filter((u) => u.status === 'active').length ?? 0,
    suspended: users?.filter((u) => u.status === 'suspended').length ?? 0,
    pending: users?.filter((u) => u.status === 'pending').length ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage workspace members
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load users
              </p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {isLoading ? <Skeleton className="h-8 w-12" /> : userCounts.total}
          </div>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : userCounts.active}
          </div>
          <p className="text-sm text-muted-foreground">Active</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-600">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              userCounts.suspended
            )}
          </div>
          <p className="text-sm text-muted-foreground">Suspended</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : userCounts.pending}
          </div>
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
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>User</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Teams</TableHeaderCell>
                <TableHeaderCell>Joined</TableHeaderCell>
                <TableHeaderCell className="w-12"></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => {
                const displayName =
                  user.display_name || user.email?.split('@')[0] || 'Unknown';
                return (
                  <TableRow
                    key={user.id}
                    className="cursor-pointer"
                    onClick={() => openUserDetails(user)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback
                            className={getAvatarColor(user.email)}
                          >
                            {displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {user.teams} team{user.teams !== 1 ? 's' : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(user.joined_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openUserDetails(user)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.status === 'active' ? (
                            <DropdownMenuItem
                              className="text-orange-600"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await updateStatus(user.id, 'suspended');
                                  toast.success('User suspended');
                                } catch {
                                  toast.error('Failed to suspend user');
                                }
                              }}
                              disabled={user.role === 'owner'}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Suspend user
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-green-600"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await updateStatus(user.id, 'active');
                                  toast.success('User activated');
                                } catch {
                                  toast.error('Failed to activate user');
                                }
                              }}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate user
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToRemove(user);
                            }}
                            disabled={user.role === 'owner'}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!isLoading && filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No users found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        )}
      </Card>

      {/* User Details Dialog */}
      <UserDetailsDialog
        user={selectedUser}
        open={isDialogOpen}
        onClose={closeUserDetails}
        onUpdateStatus={handleUpdateStatus}
        onUpdateRole={handleUpdateRole}
        isUpdating={isUpdatingStatus || isUpdatingRole}
      />

      {/* Remove User Confirmation */}
      <AlertDialog
        open={!!userToRemove}
        onOpenChange={() => setUserToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>
                {userToRemove?.display_name || userToRemove?.email}
              </strong>{' '}
              from this workspace? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
