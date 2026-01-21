import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
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
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  UserPlus,
  Building2,
  FolderKanban,
  Users,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegistrations } from '@/hooks/useRegistrations';
import type { UserRegistration } from 'shared/types';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateString: string | Date) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TableSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function RegistrationRequests() {
  const {
    pendingRegistrations,
    isLoading,
    error,
    refetch,
    approveRegistration,
    rejectRegistration,
    isApproving,
    isRejecting,
  } = useRegistrations(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] =
    useState<UserRegistration | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filter registrations by status (note: hook only fetches pending ones currently)
  const filteredRegistrations = pendingRegistrations.filter((reg) => {
    if (statusFilter === 'all') return true;
    return reg.status === statusFilter;
  });

  const handleApprove = async () => {
    if (!selectedRegistration) return;
    try {
      await approveRegistration(selectedRegistration.id);
      toast.success('Registration approved successfully');
      setApproveDialogOpen(false);
      setSelectedRegistration(null);
      refetch();
    } catch {
      toast.error('Failed to approve registration');
    }
  };

  const handleReject = async () => {
    if (!selectedRegistration) return;
    try {
      await rejectRegistration(
        selectedRegistration.id,
        rejectionReason || undefined
      );
      toast.success('Registration rejected');
      setRejectDialogOpen(false);
      setSelectedRegistration(null);
      setRejectionReason('');
      refetch();
    } catch {
      toast.error('Failed to reject registration');
    }
  };

  const openApproveDialog = (registration: UserRegistration) => {
    setSelectedRegistration(registration);
    setApproveDialogOpen(true);
  };

  const openRejectDialog = (registration: UserRegistration) => {
    setSelectedRegistration(registration);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const registrationCounts = {
    total: pendingRegistrations.length,
    pending: pendingRegistrations.filter((r) => r.status === 'pending').length,
    approved: pendingRegistrations.filter((r) => r.status === 'approved')
      .length,
    rejected: pendingRegistrations.filter((r) => r.status === 'rejected')
      .length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Registration Requests</h2>
          <p className="text-sm text-muted-foreground">
            Review and manage user signup requests
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Failed to load registrations
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
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              registrationCounts.total
            )}
          </div>
          <p className="text-sm text-muted-foreground">Total Requests</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              registrationCounts.pending
            )}
          </div>
          <p className="text-sm text-muted-foreground">Pending Review</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              registrationCounts.approved
            )}
          </div>
          <p className="text-sm text-muted-foreground">Approved</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-red-600">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              registrationCounts.rejected
            )}
          </div>
          <p className="text-sm text-muted-foreground">Rejected</p>
        </Card>
      </div>

      {/* Status Filter Tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as StatusFilter)}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({registrationCounts.pending})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>User</TableHeaderCell>
                <TableHeaderCell>Workspace</TableHeaderCell>
                <TableHeaderCell>Plans</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRegistrations.map((registration) => {
                const displayName =
                  [registration.first_name, registration.last_name]
                    .filter(Boolean)
                    .join(' ') || registration.email.split('@')[0];
                return (
                  <TableRow key={registration.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10">
                          <UserPlus className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {registration.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{registration.workspace_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {registration.planned_teams} teams
                        </span>
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {registration.planned_projects} projects
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(registration.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(registration.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={registration.id}>
                          <Button size="sm" variant="ghost">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                        {registration.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => openApproveDialog(registration)}
                              disabled={isApproving || isRejecting}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => openRejectDialog(registration)}
                              disabled={isApproving || isRejecting}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!isLoading && filteredRegistrations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UserPlus className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No registration requests</p>
            <p className="text-sm">
              {statusFilter === 'pending'
                ? 'All pending requests have been reviewed'
                : 'No requests match the selected filter'}
            </p>
          </div>
        )}
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Registration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve the registration for{' '}
              <strong>{selectedRegistration?.email}</strong>? They will gain
              access to create their workspace &quot;
              {selectedRegistration?.workspace_name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className={cn(
                'bg-green-600 text-white hover:bg-green-700',
                isApproving && 'opacity-50 cursor-not-allowed'
              )}
              disabled={isApproving}
            >
              {isApproving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Registration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject the registration for{' '}
              <strong>{selectedRegistration?.email}</strong>? You can optionally
              provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for rejection (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className={cn(
                'bg-red-600 text-white hover:bg-red-700',
                isRejecting && 'opacity-50 cursor-not-allowed'
              )}
              disabled={isRejecting}
            >
              {isRejecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
