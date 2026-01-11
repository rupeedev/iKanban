import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Copy,
  Trash2,
  UserPlus,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
type TabValue = 'all' | 'pending' | 'accepted' | 'expired';

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: InvitationStatus;
  invitedBy: string;
  sentAt: string;
  expiresAt: string;
  workspace: string;
}

// Mock data for UI development
const mockInvitations: Invitation[] = [
  { id: '1', email: 'john.doe@example.com', role: 'member', status: 'pending', invitedBy: 'admin@company.com', sentAt: '2024-01-10T10:00:00Z', expiresAt: '2024-01-17T10:00:00Z', workspace: 'Engineering' },
  { id: '2', email: 'jane.smith@example.com', role: 'admin', status: 'accepted', invitedBy: 'admin@company.com', sentAt: '2024-01-08T14:30:00Z', expiresAt: '2024-01-15T14:30:00Z', workspace: 'Design' },
  { id: '3', email: 'mike.wilson@example.com', role: 'member', status: 'pending', invitedBy: 'manager@company.com', sentAt: '2024-01-09T09:15:00Z', expiresAt: '2024-01-16T09:15:00Z', workspace: 'Engineering' },
  { id: '4', email: 'sarah.jones@example.com', role: 'viewer', status: 'expired', invitedBy: 'admin@company.com', sentAt: '2024-01-01T11:00:00Z', expiresAt: '2024-01-08T11:00:00Z', workspace: 'Marketing' },
  { id: '5', email: 'alex.brown@example.com', role: 'member', status: 'accepted', invitedBy: 'admin@company.com', sentAt: '2024-01-05T16:45:00Z', expiresAt: '2024-01-12T16:45:00Z', workspace: 'Engineering' },
  { id: '6', email: 'emily.davis@example.com', role: 'admin', status: 'pending', invitedBy: 'admin@company.com', sentAt: '2024-01-11T08:00:00Z', expiresAt: '2024-01-18T08:00:00Z', workspace: 'Design' },
  { id: '7', email: 'chris.taylor@example.com', role: 'member', status: 'revoked', invitedBy: 'manager@company.com', sentAt: '2024-01-07T13:20:00Z', expiresAt: '2024-01-14T13:20:00Z', workspace: 'Support' },
  { id: '8', email: 'lisa.anderson@example.com', role: 'viewer', status: 'pending', invitedBy: 'admin@company.com', sentAt: '2024-01-10T15:30:00Z', expiresAt: '2024-01-17T15:30:00Z', workspace: 'Marketing' },
];

function getStatusBadge(status: InvitationStatus) {
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
    admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
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

export function AdminInvitations() {
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvitations, setSelectedInvitations] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filteredInvitations = mockInvitations.filter((invitation) => {
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

  const tabCounts = {
    all: mockInvitations.length,
    pending: mockInvitations.filter((i) => i.status === 'pending').length,
    accepted: mockInvitations.filter((i) => i.status === 'accepted').length,
    expired: mockInvitations.filter((i) => i.status === 'expired').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Invitations</h2>
          <p className="text-sm text-muted-foreground">Manage all sign-up invitations</p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Send Invitation
        </Button>
      </div>

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
            <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">{tabCounts[tab]}</span>
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
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
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
            <Button variant="outline" size="sm">
              <RefreshCw className="h-3 w-3 mr-1" />
              Resend
            </Button>
            <Button variant="outline" size="sm" className="text-destructive">
              <Trash2 className="h-3 w-3 mr-1" />
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
              <TableHeaderCell>Invited By</TableHeaderCell>
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
                  <span className="text-xs text-muted-foreground">{invitation.workspace}</span>
                </TableCell>
                <TableCell>{getRoleBadge(invitation.role)}</TableCell>
                <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{invitation.invitedBy}</TableCell>
                <TableCell className="text-sm">{formatRelativeDate(invitation.sentAt)}</TableCell>
                <TableCell className="text-sm">{formatDate(invitation.expiresAt)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Resend invitation
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy invite link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
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
        {filteredInvitations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Mail className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No invitations found</p>
            <p className="text-sm">Try adjusting your filters or send a new invitation</p>
          </div>
        )}
      </Card>
    </div>
  );
}
