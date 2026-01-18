import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Github, GitlabIcon, Loader2, Unlink } from 'lucide-react';
import {
  useWorkspaceGitHubConnection,
  useWorkspaceGitHubMutations,
} from '@/hooks/useWorkspaceGitHub';
import {
  useWorkspaceGitLabConnection,
  useWorkspaceGitLabMutations,
} from '@/hooks/useWorkspaceGitLab';

export function GitProviderConnections() {
  // GitHub connection state
  const { data: githubConnection, refetch: refetchGitHubConnection } =
    useWorkspaceGitHubConnection();
  const { deleteConnection: deleteGitHubConnection } =
    useWorkspaceGitHubMutations();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // GitLab connection state
  const { data: gitlabConnection, refetch: refetchGitLabConnection } =
    useWorkspaceGitLabConnection();
  const { deleteConnection: deleteGitLabConnection } =
    useWorkspaceGitLabMutations();
  const [showGitLabDisconnectDialog, setShowGitLabDisconnectDialog] =
    useState(false);

  // GitHub connection handlers
  const handleConnectGitHub = useCallback(() => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const oauthUrl = `${apiBaseUrl}/api/oauth/github/authorize?callback_url=${encodeURIComponent(window.location.origin + '/settings/github-callback')}`;
    const popup = window.open(
      oauthUrl,
      'github-oauth',
      'width=600,height=700,scrollbars=yes'
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'github-oauth-success') {
        popup?.close();
        refetchGitHubConnection();
        window.removeEventListener('message', handleMessage);
      } else if (event.data?.type === 'github-oauth-error') {
        popup?.close();
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
  }, [refetchGitHubConnection]);

  const handleDisconnectGitHub = useCallback(async () => {
    try {
      await deleteGitHubConnection.mutateAsync();
      setShowDisconnectDialog(false);
    } catch (err) {
      console.error('Error disconnecting GitHub:', err);
    }
  }, [deleteGitHubConnection]);

  // GitLab connection handlers
  const handleConnectGitLab = useCallback(() => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const oauthUrl = `${apiBaseUrl}/api/oauth/gitlab/authorize?callback_url=${encodeURIComponent(window.location.origin + '/settings/gitlab-callback')}`;
    const popup = window.open(
      oauthUrl,
      'gitlab-oauth',
      'width=600,height=700,scrollbars=yes'
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'gitlab-oauth-success') {
        popup?.close();
        refetchGitLabConnection();
        window.removeEventListener('message', handleMessage);
      } else if (event.data?.type === 'gitlab-oauth-error') {
        popup?.close();
        window.removeEventListener('message', handleMessage);
      }
    };
    window.addEventListener('message', handleMessage);
  }, [refetchGitLabConnection]);

  const handleDisconnectGitLab = useCallback(async () => {
    try {
      await deleteGitLabConnection.mutateAsync();
      setShowGitLabDisconnectDialog(false);
    } catch (err) {
      console.error('Error disconnecting GitLab:', err);
    }
  }, [deleteGitLabConnection]);

  return (
    <>
      {/* GitHub Connection Status */}
      <div className="p-3 border rounded-md bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            <span className="text-sm font-medium">GitHub</span>
          </div>
          {githubConnection ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                @{githubConnection.github_username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnectDialog(true)}
                title="Disconnect GitHub"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnectGitHub}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* GitLab Connection Status */}
      <div className="p-3 border rounded-md bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitlabIcon className="h-4 w-4" />
            <span className="text-sm font-medium">GitLab</span>
          </div>
          {gitlabConnection ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                @{gitlabConnection.connection.gitlab_username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGitLabDisconnectDialog(true)}
                title="Disconnect GitLab"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnectGitLab}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Disconnect GitHub Confirmation Dialog */}
      <Dialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect GitHub</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your GitHub account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectGitHub}
              disabled={deleteGitHubConnection.isPending}
            >
              {deleteGitHubConnection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect GitLab Confirmation Dialog */}
      <Dialog
        open={showGitLabDisconnectDialog}
        onOpenChange={setShowGitLabDisconnectDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect GitLab</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your GitLab account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGitLabDisconnectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectGitLab}
              disabled={deleteGitLabConnection.isPending}
            >
              {deleteGitLabConnection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
