import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ArrowLeft, GitlabIcon, Lock, Search } from 'lucide-react';
import { GitLabProjectInfo, Repo } from 'shared/types';
import { useWorkspaceAvailableGitLabRepos } from '@/hooks/useWorkspaceGitLab';

interface GitLabRepoPickerStageProps {
  onBack: () => void;
  onSelect: (repo: Repo) => void;
  onError: (error: string) => void;
}

export function GitLabRepoPickerStage({
  onBack,
  onSelect,
  onError,
}: GitLabRepoPickerStageProps) {
  const [showMoreRepos, setShowMoreRepos] = useState(false);
  const [filter, setFilter] = useState('');

  const {
    data: repos = [],
    isLoading,
    error,
  } = useWorkspaceAvailableGitLabRepos(true);

  // Show error if loading fails
  if (error) {
    onError('Failed to load GitLab repositories');
  }

  // Filter repos by search
  const filteredRepos = repos.filter(
    (repo) =>
      !filter ||
      repo.name.toLowerCase().includes(filter.toLowerCase()) ||
      repo.path_with_namespace.toLowerCase().includes(filter.toLowerCase())
  );

  const handleSelectRepo = (repo: GitLabProjectInfo) => {
    // Return a Repo-like object with GitLab repo info
    // The path will be the GitLab web URL, display_name is the repo path_with_namespace
    const repoResult: Repo = {
      id: String(repo.id),
      path: repo.web_url, // Use web URL as the path for GitLab repos
      name: repo.name,
      display_name: repo.path_with_namespace,
      created_at: new Date(),
      updated_at: new Date(),
    };
    onSelect(repoResult);
  };

  return (
    <>
      <button
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        onClick={onBack}
      >
        <ArrowLeft className="h-3 w-3" />
        Back to options
      </button>

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter repositories..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full" />
            <div className="text-sm text-muted-foreground">
              Loading GitLab repositories...
            </div>
          </div>
        </div>
      )}

      {!isLoading && filteredRepos.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredRepos
            .slice(0, showMoreRepos ? filteredRepos.length : 5)
            .map((repo) => (
              <div
                key={String(repo.id)}
                className="p-4 border cursor-pointer hover:shadow-md transition-shadow rounded-lg bg-card"
                onClick={() => handleSelectRepo(repo)}
              >
                <div className="flex items-start gap-3">
                  <GitlabIcon className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {repo.name}
                      </span>
                      {repo.visibility === 'private' && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-1">
                      {repo.path_with_namespace}
                    </div>
                    {repo.description && (
                      <div className="text-xs text-muted-foreground truncate mt-1">
                        {repo.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {!showMoreRepos && filteredRepos.length > 5 && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={() => setShowMoreRepos(true)}
            >
              Show {filteredRepos.length - 5} more repositories
            </button>
          )}
          {showMoreRepos && filteredRepos.length > 5 && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={() => setShowMoreRepos(false)}
            >
              Show less
            </button>
          )}
        </div>
      )}

      {!isLoading && filteredRepos.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {filter
            ? 'No repositories match your search'
            : 'No repositories found'}
        </div>
      )}
    </>
  );
}
