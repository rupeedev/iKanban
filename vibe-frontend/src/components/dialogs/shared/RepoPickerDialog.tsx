import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  ArrowLeft,
  FolderGit,
  Github,
  GitlabIcon,
  Loader2,
  Search,
} from 'lucide-react';
import { repoApi } from '@/lib/api';
import { DirectoryEntry, Repo } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { FolderPickerDialog } from './FolderPickerDialog';
import { useGitRepos } from '@/hooks/useGitRepos';
import { useWorkspaceGitHubConnection } from '@/hooks/useWorkspaceGitHub';
import { useWorkspaceGitLabConnection } from '@/hooks/useWorkspaceGitLab';
import { GitHubRepoPickerStage } from './GitHubRepoPickerStage';
import { GitLabRepoPickerStage } from './GitLabRepoPickerStage';

export interface RepoPickerDialogProps {
  value?: string;
  title?: string;
  description?: string;
  /** Hide GitHub option (use for project repos that require local paths) */
  hideGitHub?: boolean;
  /** Hide GitLab option (use for project repos that require local paths) */
  hideGitLab?: boolean;
}

type Stage = 'options' | 'existing' | 'github' | 'gitlab';

const RepoPickerDialogImpl = NiceModal.create<RepoPickerDialogProps>(
  ({
    title = 'Select Repository',
    description = 'Choose a git repository',
    hideGitHub = false,
    hideGitLab = false,
  }) => {
    const modal = useModal();
    const [stage, setStage] = useState<Stage>('options');
    const [error, setError] = useState('');
    const [isWorking, setIsWorking] = useState(false);

    // Stage: existing - use TanStack Query hook (prevents 429 rate limiting)
    const [showMoreRepos, setShowMoreRepos] = useState(false);
    const {
      repos: allRepos,
      isLoading: reposLoading,
      error: reposError,
    } = useGitRepos(stage === 'existing');

    // GitHub connection check (for showing GitHub option)
    const { data: githubConnection } = useWorkspaceGitHubConnection();

    // GitLab connection check (for showing GitLab option)
    const { data: gitlabConnection } = useWorkspaceGitLabConnection();

    useEffect(() => {
      if (modal.visible) {
        setStage('options');
        setError('');
        setShowMoreRepos(false);
      }
    }, [modal.visible]);

    // Show repo loading errors
    useEffect(() => {
      if (reposError) {
        setError('Failed to load repositories');
      }
    }, [reposError]);

    const registerAndReturn = async (path: string) => {
      setIsWorking(true);
      setError('');
      try {
        const repo = await repoApi.register({ path });
        modal.resolve(repo);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to register repository'
        );
      } finally {
        setIsWorking(false);
      }
    };

    const handleSelectRepo = (repo: DirectoryEntry) => {
      registerAndReturn(repo.path);
    };

    const handleSelectGitHubRepo = (repo: Repo) => {
      modal.resolve(repo);
      modal.hide();
    };

    const handleSelectGitLabRepo = (repo: Repo) => {
      modal.resolve(repo);
      modal.hide();
    };

    const handleBrowseForRepo = async () => {
      setError('');
      const selectedPath = await FolderPickerDialog.show({
        title: 'Select Git Repository',
        description: 'Choose an existing git repository',
      });
      if (selectedPath) {
        registerAndReturn(selectedPath);
      }
    };

    const handleCancel = () => {
      modal.resolve(null);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open && !isWorking) {
        handleCancel();
      }
    };

    const goBack = () => {
      setStage('options');
      setError('');
    };

    return (
      <div className="fixed inset-0 z-[10000] pointer-events-none [&>*]:pointer-events-auto">
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-[500px] w-full">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Stage: Options */}
              {stage === 'options' && (
                <>
                  {/* GitHub option - only show if connected and not hidden */}
                  {githubConnection && !hideGitHub && (
                    <div
                      className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                      onClick={() => setStage('github')}
                    >
                      <div className="flex items-start gap-3">
                        <Github className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">
                            From GitHub
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Select from your GitHub repositories (@
                            {githubConnection.github_username})
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* GitLab option - only show if connected and not hidden */}
                  {gitlabConnection && !hideGitLab && (
                    <div
                      className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                      onClick={() => setStage('gitlab')}
                    >
                      <div className="flex items-start gap-3">
                        <GitlabIcon className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">
                            From GitLab
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Select from your GitLab repositories
                            {gitlabConnection.connection.gitlab_username &&
                              ` (@${gitlabConnection.connection.gitlab_username})`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                    onClick={() => setStage('existing')}
                  >
                    <div className="flex items-start gap-3">
                      <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground">
                          From Git Repository
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Select an existing repository from your system
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Stage: Existing */}
              {stage === 'existing' && (
                <>
                  <button
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={goBack}
                    disabled={isWorking}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to options
                  </button>

                  {reposLoading && (
                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full" />
                        <div className="text-sm text-muted-foreground">
                          Loading repositories...
                        </div>
                      </div>
                    </div>
                  )}

                  {!reposLoading && allRepos.length > 0 && (
                    <div className="space-y-2">
                      {allRepos
                        .slice(0, showMoreRepos ? allRepos.length : 3)
                        .map((repo) => (
                          <div
                            key={repo.path}
                            className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                            onClick={() => !isWorking && handleSelectRepo(repo)}
                          >
                            <div className="flex items-start gap-3">
                              <FolderGit className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-foreground">
                                  {repo.name}
                                </div>
                                <div className="text-xs text-muted-foreground truncate mt-1">
                                  {repo.path}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                      {!showMoreRepos && allRepos.length > 3 && (
                        <button
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                          onClick={() => setShowMoreRepos(true)}
                        >
                          Show {allRepos.length - 3} more repositories
                        </button>
                      )}
                      {showMoreRepos && allRepos.length > 3 && (
                        <button
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                          onClick={() => setShowMoreRepos(false)}
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    className="p-4 border border-dashed cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                    onClick={() => !isWorking && handleBrowseForRepo()}
                  >
                    <div className="flex items-start gap-3">
                      <Search className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground">
                          Browse for repository
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Browse and select any repository on your system
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Stage: GitHub */}
              {stage === 'github' && (
                <GitHubRepoPickerStage
                  onBack={goBack}
                  onSelect={handleSelectGitHubRepo}
                  onError={setError}
                />
              )}

              {/* Stage: GitLab */}
              {stage === 'gitlab' && (
                <GitLabRepoPickerStage
                  onBack={goBack}
                  onSelect={handleSelectGitLabRepo}
                  onError={setError}
                />
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isWorking && stage === 'existing' && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registering repository...
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

export const RepoPickerDialog = defineModal<RepoPickerDialogProps, Repo | null>(
  RepoPickerDialogImpl
);
