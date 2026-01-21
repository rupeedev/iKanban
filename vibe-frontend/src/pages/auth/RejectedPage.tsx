import { Link } from 'react-router-dom';
import { Layers, ArrowLeft, XCircle, Mail, RefreshCcw } from 'lucide-react';
import { useUserRegistration } from '@/hooks/useUserRegistration';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';

export function RejectedPage() {
  const { registration, isLoading, refresh } = useUserRegistration();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <Loader />
      </div>
    );
  }

  // If no registration or not rejected, show appropriate message
  if (!registration || registration.status !== 'rejected') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Layers className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold text-white">iKanban</h1>
          </div>
        </div>
        <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
          <p className="text-zinc-400 mb-4">
            No rejected registration found. You may have already been approved
            or haven&apos;t registered yet.
          </p>
          <Button asChild>
            <Link to="/projects">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const displayName = [registration.first_name, registration.last_name]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Registration Status</p>
      </div>

      {/* Rejection Card */}
      <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <XCircle className="h-12 w-12 text-red-500" />
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Registration Declined
            </h2>
            <p className="text-zinc-400 mb-4">
              Unfortunately, your registration request was not approved.
            </p>
          </div>
        </div>

        {/* Registration Details */}
        <div className="mt-6 space-y-4">
          {displayName && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Name</span>
              <span className="text-zinc-300">{displayName}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Email</span>
            <span className="text-zinc-300">{registration.email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Requested Workspace</span>
            <span className="text-zinc-300">{registration.workspace_name}</span>
          </div>
        </div>

        {/* Rejection Reason */}
        {registration.rejection_reason && (
          <div className="mt-6 p-4 bg-red-950/30 border border-red-900/50 rounded-lg">
            <p className="text-sm font-medium text-red-400 mb-1">Reason</p>
            <p className="text-sm text-zinc-300">
              {registration.rejection_reason}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild>
            <a href="mailto:support@scho1ar.com">
              <Mail className="h-4 w-4 mr-2" />
              Contact Support
            </a>
          </Button>
          <Button variant="outline" onClick={refresh}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Check Status Again
          </Button>
        </div>

        {/* Additional Info */}
        <p className="mt-6 text-xs text-zinc-500 text-center">
          If you believe this was a mistake, please contact our support team.
          You can also try registering again with a different workspace name.
        </p>
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
