import { useCallback, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Mail,
  Building,
  Users,
  FolderKanban,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { registrationsApi } from '@/lib/api';
import { registrationsKeys } from '@/hooks/useRegistrations';
import type { UserRegistration, RegistrationStatus } from 'shared/types';
import { format, formatDistanceToNow } from 'date-fns';

const statusConfig: Record<
  RegistrationStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive';
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  pending: {
    label: 'Pending Review',
    variant: 'default',
    icon: Clock,
    color: 'text-amber-500',
  },
  approved: {
    label: 'Approved',
    variant: 'secondary',
    icon: CheckCircle,
    color: 'text-green-500',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
    icon: XCircle,
    color: 'text-red-500',
  },
};

export function SuperadminRegistrationDetail() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch registration details
  // Note: Using the list endpoint since there's no getById, then finding by ID
  const {
    data: registration,
    isLoading,
    isError,
    error,
  } = useQuery<UserRegistration | null>({
    queryKey: ['registration', registrationId],
    queryFn: async () => {
      const registrations = await registrationsApi.list();
      return registrations.find((r) => r.id === registrationId) ?? null;
    },
    enabled: !!registrationId,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: () => registrationsApi.approve(registrationId!),
    onSuccess: (updatedRegistration) => {
      queryClient.setQueryData(
        ['registration', registrationId],
        updatedRegistration
      );
      queryClient.invalidateQueries({
        queryKey: registrationsKeys.pending(),
        refetchType: 'none',
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: (reason?: string) =>
      registrationsApi.reject(registrationId!, reason),
    onSuccess: (updatedRegistration) => {
      queryClient.setQueryData(
        ['registration', registrationId],
        updatedRegistration
      );
      queryClient.invalidateQueries({
        queryKey: registrationsKeys.pending(),
        refetchType: 'none',
      });
      setShowRejectDialog(false);
      setRejectionReason('');
    },
  });

  const handleApprove = useCallback(async () => {
    await approveMutation.mutateAsync();
  }, [approveMutation]);

  const handleReject = useCallback(async () => {
    await rejectMutation.mutateAsync(rejectionReason || undefined);
  }, [rejectMutation, rejectionReason]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !registration) {
    return (
      <div className="space-y-6">
        <Link
          to="/superadmin/registrations"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Registrations
        </Link>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="font-medium">Registration Not Found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error?.message ||
                  'The requested registration could not be found.'}
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/superadmin/registrations')}
                className="mt-4"
              >
                Return to Registrations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = statusConfig[registration.status];
  const StatusIcon = config.icon;
  const isPending = registration.status === 'pending';
  const isActioning = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        to="/superadmin/registrations"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Registrations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-lg ${
              registration.status === 'pending'
                ? 'bg-amber-500/10'
                : registration.status === 'approved'
                  ? 'bg-green-500/10'
                  : 'bg-red-500/10'
            }`}
          >
            <StatusIcon className={`h-6 w-6 ${config.color}`} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              {registration.first_name && registration.last_name
                ? `${registration.first_name} ${registration.last_name}`
                : registration.email}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={config.variant}>{config.label}</Badge>
              <span className="text-sm text-muted-foreground">
                Submitted{' '}
                {formatDistanceToNow(new Date(registration.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions for pending registrations */}
        {isPending && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(true)}
              disabled={isActioning}
              className="text-destructive hover:text-destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button onClick={handleApprove} disabled={isActioning}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </div>
        )}
      </div>

      {/* Registration Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* User Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              User Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">
                  {registration.email}
                </p>
              </div>
            </div>
            {(registration.first_name || registration.last_name) && (
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Name</p>
                  <p className="text-sm text-muted-foreground">
                    {[registration.first_name, registration.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Registration Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(registration.created_at), 'PPpp')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Workspace Plans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Workspace Plans
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Building className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Workspace Name</p>
                <p className="text-sm text-muted-foreground">
                  {registration.workspace_name}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Planned Teams</p>
                <p className="text-sm text-muted-foreground">
                  {registration.planned_teams}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FolderKanban className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Planned Projects</p>
                <p className="text-sm text-muted-foreground">
                  {registration.planned_projects}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review Information (if reviewed) */}
      {registration.status !== 'pending' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${config.color}`} />
              Review Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {registration.reviewed_at && (
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Reviewed At</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(registration.reviewed_at), 'PPpp')}
                  </p>
                </div>
              </div>
            )}
            {registration.reviewed_by && (
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Reviewed By</p>
                  <p className="text-sm text-muted-foreground">
                    {registration.reviewed_by}
                  </p>
                </div>
              </div>
            )}
            {registration.rejection_reason && (
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Rejection Reason</p>
                  <p className="text-sm text-muted-foreground">
                    {registration.rejection_reason}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this registration request? You can
              optionally provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">
                Rejection Reason (optional)
              </Label>
              <Textarea
                id="rejection-reason"
                placeholder="Enter a reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending
                ? 'Rejecting...'
                : 'Reject Registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
