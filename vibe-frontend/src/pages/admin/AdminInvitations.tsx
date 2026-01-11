import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
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
import {
  Mail,
  Search,
  MoreVertical,
  RefreshCw,
  Trash2,
  UserPlus,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAdminInvitations, useAdminInvitationMutations } from '@/hooks/useAdmin';
import { toast } from 'sonner';

type TabValue = 'all' | 'pending' | 'accepted' | 'expired';

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case 'accepted':
      return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</Badge>;
    case 'expired':
      return <Badge variant="outline" className="text-orange-600 border-orange-600"><AlertCircle className="h-3 w-3 mr-1" />Expired</Badge>;
    case 'revoked':
      return <Badge variant="outline" className="text-red-600 border-red-600"><XCircle className="h-3 w-3 mr-1" />Revoked</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRoleBadge(role: string) {
  const colors: Record<string, string> = {
    owner: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    maintainer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    contributor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  return <Badge className={cn('capitalize', colors[role] || '')}>{role}</Badge>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateString);
}

function TableSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/6" />
        </div>
      ))}
    </div>
  );
}

interface SendInvitationDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (email: string, role: string) => Promise<void>;
  isSending: boolean;
}

function SendInvitationDialog({ open, onClose, onSend, isSending }: SendInvitationDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('contributor');

  const handleSend = async () => {
    if (!email) return;
    await onSend(email, role);
    setEmail('');
    setRole('contributor');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Invitation</DialogTitle>
          <DialogDescription>
            Invite a new member to join the workspace
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="maintainer">Maintainer</SelectItem>
                <SelectItem value="contributor">Contributor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!email || isSending}>
            {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminInvitations() {
  const { currentWorkspaceId } = useWorkspace();
  const { data: invitations, isLoading, error } = useAdminInvitations(currentWorkspaceId ?? undefined);
  const { createInvitation, resendInvitation, revokeInvitation, isCreating, isResending, isRevoking } = useAdminInvitationMutations(currentWorkspaceId ?? undefined);

  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvitations, setSelectedInvitations] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showSendDialog, setShowSendDialog] = useState(false);

  const filteredInvitations = (invitations || []).filter((invitation) => {
    // Tab filter
    if (activeTab !== 'all' && invitation.status !== activeTab) return false;

    // Search filter
    if (searchQuery && !invitation.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Role filter
    if (roleFilter !== 'all' && invitation.role !== roleFilter) return false;

    return true;
  });

  const toggleSelectAll = () => {
    if (selectedInvitations.length === filteredInvitations.length) {
      setSelectedInvitations([]);
    } else {
      setSelectedInvitations(filteredInvitations.map((i) => i.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedInvitations((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSendInvitation = async (email: string, role: string) => {
    try {
      await createInvitation({
        email,
        role,
        workspace_id: currentWorkspaceId!,
      });
      toast.success('Invitation sent successfully');
      setShowSendDialog(false);
    } catch (err) {
      toast.error('Failed to send invitation');
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await resendInvitation(invitationId);
      toast.success('Invitation resent');
    } catch (err) {
      toast.error('Failed to resend invitation');
    }
  };

  const handleRevoke = async (invitationId: string) => {
    try {
      await revokeInvitation(invitationId);
      toast.success('Invitation revoked');
    } catch (err) {
      toast.error('Failed to revoke invitation');
    }
  };

  const handleBulkResend = async () => {
    for (const id of selectedInvitations) {
      await handleResend(id);
    }
    setSelectedInvitations([]);
  };

  const handleBulkRevoke = async () => {
    for (const id of selectedInvitations) {
      await handleRevoke(id);
    }
    setSelectedInvitations([]);
  };

  const tabCounts = {
    all: invitations?.length ?? 0,
    pending: invitations?.filter((i) => i.status === 'pending').length ?? 0,
    accepted: invitations?.filter((i) => i.status === 'accepted').length ?? 0,
    expired: invitations?.filter((i) => i.status === 'expired').length ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Invitations</h2>
          <p className="text-sm text-muted-foreground">Manage workspace invitations</p>
        </div>
        <Button onClick={() => setShowSendDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Send Invitation
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Failed to load invitations</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['all', 'pending', 'accepted', 'expired'] as TabValue[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">
              {isLoading ? '...' : tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
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
                <SelectItem value="maintainer">Maintainer</SelectItem>
                <SelectItem value="contributor">Contributor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedInvitations.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium">{selectedInvitations.length} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBulkResend} disabled={isResending}>
              {isResending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Resend
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={handleBulkRevoke} disabled={isRevoking}>
              {isRevoking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Revoke
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedInvitations([])}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-12">
                  <Checkbox
                    checked={selectedInvitations.length === filteredInvitations.length && filteredInvitations.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Team</TableHeaderCell>
                <TableHeaderCell>Sent</TableHeaderCell>
                <TableHeaderCell>Expires</TableHeaderCell>
                <TableHeaderCell className="w-12"></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedInvitations.includes(invitation.id)}
                      onCheckedChange={() => toggleSelect(invitation.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{invitation.email}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{invitation.workspace_name}</span>
                  </TableCell>
                  <TableCell>{getRoleBadge(invitation.role)}</TableCell>
                  <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invitation.team_name}</TableCell>
                  <TableCell className="text-sm">{formatRelativeDate(invitation.sent_at)}</TableCell>
                  <TableCell className="text-sm">{formatDate(invitation.expires_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleResend(invitation.id)}
                          disabled={invitation.status === 'accepted' || isResending}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Resend invitation
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleRevoke(invitation.id)}
                          disabled={invitation.status === 'accepted' || isRevoking}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke invitation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filteredInvitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Mail className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No invitations found</p>
            <p className="text-sm">Try adjusting your filters or send a new invitation</p>
          </div>
        )}
      </Card>

      {/* Send Invitation Dialog */}
      <SendInvitationDialog
        open={showSendDialog}
        onClose={() => setShowSendDialog(false)}
        onSend={handleSendInvitation}
        isSending={isCreating}
      />
    </div>
  );
}
