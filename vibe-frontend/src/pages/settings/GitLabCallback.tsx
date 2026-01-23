import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

/**
 * GitLab OAuth callback page - handles the redirect from backend after OAuth
 * This page sends a postMessage to the parent window to signal success/failure
 * and allows the parent to close the popup and refetch connection status.
 */
export function GitLabCallback() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const error = searchParams.get('error');

  useEffect(() => {
    // Send message to parent window
    if (window.opener) {
      if (success) {
        window.opener.postMessage({ type: 'gitlab-oauth-success' }, window.location.origin);
      } else {
        window.opener.postMessage(
          { type: 'gitlab-oauth-error', error: error || 'Unknown error' },
          window.location.origin
        );
      }
    }

    // Auto-close after a short delay to show feedback
    const timeout = setTimeout(() => {
      window.close();
    }, 1500);

    return () => clearTimeout(timeout);
  }, [success, error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      {success ? (
        <>
          <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">
            GitLab Connected!
          </h1>
          <p className="text-muted-foreground text-center">
            This window will close automatically...
          </p>
        </>
      ) : error ? (
        <>
          <XCircle className="h-16 w-16 text-destructive mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Connection Failed
          </h1>
          <p className="text-muted-foreground text-center">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">
            This window will close automatically...
          </p>
        </>
      ) : (
        <>
          <Loader2 className="h-16 w-16 text-primary mb-4 animate-spin" />
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Connecting to GitLab...
          </h1>
          <p className="text-muted-foreground text-center">Please wait...</p>
        </>
      )}
    </div>
  );
}
