import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, ArrowLeft, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { emailVerificationApi, VerifyEmailResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';

type VerificationState =
  | { status: 'loading' }
  | { status: 'success'; data: VerifyEmailResponse }
  | { status: 'error'; message: string };

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerificationState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({
        status: 'error',
        message: 'Missing verification token. Please check your email link.',
      });
      return;
    }

    let isCancelled = false;

    const verifyEmail = async () => {
      try {
        const result = await emailVerificationApi.verifyToken(token);
        if (!isCancelled) {
          setState({ status: 'success', data: result });
        }
      } catch (error) {
        if (!isCancelled) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to verify email. The token may have expired or already been used.';
          setState({ status: 'error', message });
        }
      }
    };

    verifyEmail();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950 px-4">
      {/* Branding */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Layers className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">iKanban</h1>
        </div>
        <p className="text-zinc-400">Email Verification</p>
      </div>

      {/* Verification Card */}
      <div className="w-full max-w-md bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
        {state.status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="text-zinc-300">Verifying your email...</p>
          </div>
        )}

        {state.status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Email Verified!
              </h2>
              <p className="text-zinc-400 mb-4">
                Your email{' '}
                <span className="text-primary">{state.data.email}</span> has
                been successfully verified.
              </p>
              {state.data.trust_level_upgraded && (
                <p className="text-sm text-green-400 mb-4">
                  Your account trust level has been upgraded.
                </p>
              )}
            </div>
            <Button asChild className="w-full">
              <Link to="/projects">Go to Dashboard</Link>
            </Button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="h-12 w-12 text-red-500" />
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Verification Failed
              </h2>
              <p className="text-zinc-400 mb-4">{state.message}</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Button asChild variant="outline">
                <Link to="/settings/general">Go to Settings to Resend</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/projects">Go to Dashboard</Link>
              </Button>
            </div>
          </div>
        )}
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
