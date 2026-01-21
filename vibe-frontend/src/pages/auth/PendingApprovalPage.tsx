import { useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Layers,
  ArrowLeft,
  Clock,
  RefreshCw,
  Mail,
  Building2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useUserRegistration } from '@/hooks/useUserRegistration';
import { useQueryClient } from '@tanstack/react-query';

const POLL_INTERVAL = 30000; // 30 seconds

export function PendingApprovalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    registration,
    isLoading,
    error,
    isApproved,
    isRejected,
    isPending,
    hasRegistration,
  } = useUserRegistration();

  // Auto-redirect on status change
  useEffect(() => {
    if (isApproved) {
      navigate('/workspace/new', { replace: true });
    } else if (isRejected) {
      navigate('/rejected', { replace: true });
    }
  }, [isApproved, isRejected, navigate]);

  // Poll for status changes
  useEffect(() => {
    if (!isPending) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: ['user-registration'],
      });
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [isPending, queryClient]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['user-registration'],
    });
  }, [queryClient]);

  // If no registration exists, redirect to register page
  useEffect(() => {
    if (!isLoading && !hasRegistration) {
      navigate('/register', { replace: true });
    }
  }, [isLoading, hasRegistration, navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading registration status...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Layers className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold text-white">iKanban</h1>
          </div>
        </div>
        <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
          <Alert variant="destructive">
            <AlertTitle>Error loading registration</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          <Button onClick={handleRefresh} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Main pending approval content
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Your AI Task Tracker</p>
      </div>

      {/* Pending Approval Card */}
      <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-amber-500/10">
              <Clock className="h-10 w-10 text-amber-500" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            Thank You for Registering!
          </h2>
          <p className="text-zinc-400">Your request is under review.</p>
        </div>

        {/* Registration Details */}
        {registration && (
          <div className="space-y-4 mb-6">
            <Alert>
              <Building2 className="h-4 w-4" />
              <AlertTitle>Workspace Request</AlertTitle>
              <AlertDescription>
                <strong>{registration.workspace_name}</strong>
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2 text-sm text-zinc-400 px-2">
              <Mail className="h-4 w-4" />
              <span>{registration.email}</span>
            </div>

            <div className="bg-zinc-900/50 rounded-lg p-4 text-sm text-zinc-300">
              <p className="mb-2">
                <strong className="text-white">What happens next?</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-400">
                <li>An administrator will review your registration</li>
                <li>You&apos;ll receive an email once approved</li>
                <li>This usually takes less than 24 hours</li>
              </ul>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <span>Status:</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 font-medium">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button onClick={handleRefresh} variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Check Status
          </Button>
          <p className="text-center text-xs text-zinc-500">
            Status is automatically checked every 30 seconds
          </p>
        </div>
      </div>

      {/* Back link */}
      <Link
        to="/"
        className="mt-8 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
