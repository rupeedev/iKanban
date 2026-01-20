import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Flag,
  Shield,
  Ban,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  Eye,
  XCircle,
  Loader2,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types for Trust & Safety (IKA-186 - IKA-190)
interface UserTrustProfile {
  id: string;
  user_id: string;
  email: string;
  display_name?: string;
  trust_level: number;
  email_verified: boolean;
  email_verified_at?: string;
  account_age_days: number;
  total_tasks_created: number;
  members_invited: number;
  is_flagged: boolean;
  flagged_reason?: string;
  flagged_at?: string;
  flagged_by?: string;
  is_banned: boolean;
  banned_at?: string;
  banned_by?: string;
  ban_reason?: string;
  created_at: string;
  updated_at: string;
}

interface AbuseSignal {
  id: string;
  user_id: string;
  signal_type: string;
  severity: 'low' | 'medium' | 'high';
  description?: string;
  metadata: Record<string, unknown>;
  source_ip?: string;
  is_resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  created_at: string;
}

// Mock data for development (to be replaced with API hooks)
const mockFlaggedUsers: UserTrustProfile[] = [
  {
    id: '1',
    user_id: 'user_123',
    email: 'suspicious@tempmail.com',
    display_name: 'Suspicious User',
    trust_level: 0,
    email_verified: false,
    account_age_days: 2,
    total_tasks_created: 0,
    members_invited: 0,
    is_flagged: true,
    flagged_reason: 'Multiple abuse signals detected',
    flagged_at: '2024-01-15T10:00:00Z',
    flagged_by: 'system',
    is_banned: false,
    created_at: '2024-01-13T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'user_456',
    email: 'spammer@example.com',
    display_name: 'Spam Account',
    trust_level: 0,
    email_verified: true,
    email_verified_at: '2024-01-10T10:00:00Z',
    account_age_days: 5,
    total_tasks_created: 50,
    members_invited: 0,
    is_flagged: true,
    flagged_reason: 'Reported for spam by multiple users',
    flagged_at: '2024-01-14T10:00:00Z',
    flagged_by: 'admin_001',
    is_banned: false,
    created_at: '2024-01-09T10:00:00Z',
    updated_at: '2024-01-14T10:00:00Z',
  },
];

const mockAbuseSignals: Record<string, AbuseSignal[]> = {
  user_123: [
    {
      id: 's1',
      user_id: 'user_123',
      signal_type: 'disposable_email',
      severity: 'medium',
      description: 'Email from known disposable email provider',
      metadata: { provider: 'tempmail.com' },
      is_resolved: false,
      created_at: '2024-01-13T10:00:00Z',
    },
    {
      id: 's2',
      user_id: 'user_123',
      signal_type: 'rapid_registration',
      severity: 'high',
      description: 'Multiple accounts created from same IP',
      metadata: { count: 5, time_window: '1 hour' },
      source_ip: '192.168.1.100',
      is_resolved: false,
      created_at: '2024-01-13T10:05:00Z',
    },
  ],
  user_456: [
    {
      id: 's3',
      user_id: 'user_456',
      signal_type: 'reported_spam',
      severity: 'high',
      description: 'Reported by 3 different users for spam content',
      metadata: { reports: 3 },
      is_resolved: false,
      created_at: '2024-01-14T09:00:00Z',
    },
  ],
};

function getTrustLevelBadge(level: number) {
  const levels = [
    { name: 'New', color: 'bg-gray-100 text-gray-700' },
    { name: 'Basic', color: 'bg-blue-100 text-blue-700' },
    { name: 'Standard', color: 'bg-green-100 text-green-700' },
    { name: 'Trusted', color: 'bg-purple-100 text-purple-700' },
    { name: 'Verified', color: 'bg-yellow-100 text-yellow-700' },
  ];
  const config = levels[level] || levels[0];
  return (
    <Badge className={config.color}>
      Level {level}: {config.name}
    </Badge>
  );
}

function getSeverityBadge(severity: string) {
  const colors: Record<string, string> = {
    low: 'bg-yellow-100 text-yellow-700',
    medium: 'bg-orange-100 text-orange-700',
    high: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, React.ReactNode> = {
    low: <AlertCircle className="h-3 w-3 mr-1" />,
    medium: <AlertTriangle className="h-3 w-3 mr-1" />,
    high: <XCircle className="h-3 w-3 mr-1" />,
  };
  return (
    <Badge className={cn('flex items-center', colors[severity] || colors.low)}>
      {icons[severity]}
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

function getSignalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    rapid_registration: 'Rapid Registration',
    disposable_email: 'Disposable Email',
    suspicious_activity: 'Suspicious Activity',
    rate_limit_exceeded: 'Rate Limit Exceeded',
    reported_spam: 'Reported Spam',
    failed_login_attempts: 'Failed Login Attempts',
  };
  return labels[type] || type;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAvatarColor(str: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-purple-500',
  ];
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

interface UserDetailsDialogProps {
  user: UserTrustProfile | null;
  signals: AbuseSignal[];
  open: boolean;
  onClose: () => void;
  onUnflag: () => void;
  onBan: (reason: string) => void;
  isLoading: boolean;
}

function UserDetailsDialog({
  user,
  signals,
  open,
  onClose,
  onUnflag,
  onBan,
  isLoading,
}: UserDetailsDialogProps) {
  const [banReason, setBanReason] = useState('');
  const [showBanConfirm, setShowBanConfirm] = useState(false);

  if (!user) return null;

  const displayName = user.display_name || user.email.split('@')[0];

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-orange-500" />
              Flagged User Details
            </DialogTitle>
            <DialogDescription>
              Review user information and abuse signals
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* User Info */}
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className={getAvatarColor(user.email)}>
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{displayName}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getTrustLevelBadge(user.trust_level)}
                  {user.email_verified ? (
                    <Badge className="bg-green-100 text-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Email Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-700">
                      <Clock className="h-3 w-3 mr-1" />
                      Email Unverified
                    </Badge>
                  )}
                  {user.is_banned && (
                    <Badge className="bg-red-100 text-red-700">
                      <Ban className="h-3 w-3 mr-1" />
                      Banned
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold">{user.account_age_days}</p>
                <p className="text-xs text-muted-foreground">
                  Account Age (days)
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold">{user.total_tasks_created}</p>
                <p className="text-xs text-muted-foreground">Tasks Created</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold">{user.members_invited}</p>
                <p className="text-xs text-muted-foreground">Members Invited</p>
              </div>
            </div>

            {/* Flag Info */}
            {user.flagged_reason && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <Flag className="h-4 w-4 text-orange-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-orange-900">Flag Reason</p>
                      <p className="text-sm text-orange-700">
                        {user.flagged_reason}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        Flagged {user.flagged_at && formatDate(user.flagged_at)}{' '}
                        by {user.flagged_by || 'system'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Abuse Signals */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Abuse Signals ({signals.length})
              </h4>
              {signals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No abuse signals
                </p>
              ) : (
                <div className="space-y-3">
                  {signals.map((signal) => (
                    <Card key={signal.id} className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {getSignalTypeLabel(signal.signal_type)}
                            </span>
                            {getSeverityBadge(signal.severity)}
                          </div>
                          {signal.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {signal.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(signal.created_at)}
                            {signal.source_ip && ` • IP: ${signal.source_ip}`}
                          </p>
                        </div>
                        {signal.is_resolved ? (
                          <Badge className="bg-green-100 text-green-700">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700">
                            Open
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={onUnflag}
              disabled={isLoading || user.is_banned}
              className="text-green-600"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Unflag User
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowBanConfirm(true)}
              disabled={isLoading || user.is_banned}
            >
              <Ban className="h-4 w-4 mr-2" />
              Ban User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Confirmation Dialog */}
      <AlertDialog open={showBanConfirm} onOpenChange={setShowBanConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to ban{' '}
              <strong>{user.display_name || user.email}</strong>? This will
              prevent them from accessing the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Ban Reason</label>
            <Textarea
              placeholder="Enter reason for banning..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBanReason('')}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onBan(banReason);
                setBanReason('');
                setShowBanConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground"
              disabled={!banReason.trim()}
            >
              Ban User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AdminFlaggedUsers() {
  const [filter, setFilter] = useState<'all' | 'flagged' | 'banned'>('all');
  const [selectedUser, setSelectedUser] = useState<UserTrustProfile | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // TODO: Replace with actual API hooks
  const flaggedUsers = mockFlaggedUsers;
  const isLoadingUsers = false;

  const filteredUsers = flaggedUsers.filter((user) => {
    if (filter === 'flagged') return user.is_flagged && !user.is_banned;
    if (filter === 'banned') return user.is_banned;
    return true;
  });

  const openUserDetails = (user: UserTrustProfile) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleUnflag = async () => {
    if (!selectedUser) return;
    setIsLoading(true);
    // TODO: Call API to unflag user
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const handleBan = async (reason: string) => {
    if (!selectedUser) return;
    setIsLoading(true);
    // TODO: Call API to ban user
    console.log('Banning user:', selectedUser.user_id, 'Reason:', reason);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const userCounts = {
    total: flaggedUsers.length,
    flagged: flaggedUsers.filter((u) => u.is_flagged && !u.is_banned).length,
    banned: flaggedUsers.filter((u) => u.is_banned).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Trust & Safety
          </h2>
          <p className="text-sm text-muted-foreground">
            Review flagged users and abuse signals
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Flag className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {isLoadingUsers ? (
                  <Skeleton className="h-8 w-8" />
                ) : (
                  userCounts.flagged
                )}
              </div>
              <p className="text-sm text-muted-foreground">Flagged Users</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <Ban className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {isLoadingUsers ? (
                  <Skeleton className="h-8 w-8" />
                ) : (
                  userCounts.banned
                )}
              </div>
              <p className="text-sm text-muted-foreground">Banned Users</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <AlertTriangle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {isLoadingUsers ? (
                  <Skeleton className="h-8 w-8" />
                ) : (
                  Object.values(mockAbuseSignals)
                    .flat()
                    .filter((s) => !s.is_resolved).length
                )}
              </div>
              <p className="text-sm text-muted-foreground">Open Signals</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="flagged">Flagged Only</SelectItem>
                <SelectItem value="banned">Banned Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <div className="space-y-4">
        {isLoadingUsers ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </>
        ) : filteredUsers.length === 0 ? (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <CheckCircle className="h-12 w-12 mb-4 text-green-500" />
              <p className="text-lg font-medium">No flagged users</p>
              <p className="text-sm">All users are in good standing</p>
            </div>
          </Card>
        ) : (
          filteredUsers.map((user) => {
            const displayName = user.display_name || user.email.split('@')[0];
            const signals = mockAbuseSignals[user.user_id] || [];
            const highSeverityCount = signals.filter(
              (s) => s.severity === 'high' && !s.is_resolved
            ).length;

            return (
              <Card
                key={user.id}
                className={cn(
                  'p-4 cursor-pointer transition-colors hover:bg-muted/50',
                  user.is_banned && 'border-red-200 bg-red-50/50'
                )}
                onClick={() => openUserDetails(user)}
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className={getAvatarColor(user.email)}>
                      {displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{displayName}</h3>
                      {user.is_banned && (
                        <Badge className="bg-red-100 text-red-700">
                          Banned
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {getTrustLevelBadge(user.trust_level)}
                      {signals.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {signals.length} signal
                          {signals.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {highSeverityCount > 0 && (
                        <Badge className="bg-red-100 text-red-700 text-xs">
                          {highSeverityCount} high severity
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      Flagged{' '}
                      {user.flagged_at
                        ? new Date(user.flagged_at).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-1">
                      <Eye className="h-4 w-4 mr-1" />
                      Review
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* User Details Dialog */}
      <UserDetailsDialog
        user={selectedUser}
        signals={
          selectedUser ? mockAbuseSignals[selectedUser.user_id] || [] : []
        }
        open={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setSelectedUser(null);
        }}
        onUnflag={handleUnflag}
        onBan={handleBan}
        isLoading={isLoading}
      />
    </div>
  );
}
