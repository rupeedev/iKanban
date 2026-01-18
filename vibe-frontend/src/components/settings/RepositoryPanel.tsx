import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, FolderKanban } from 'lucide-react';
import { projectsApi } from '@/lib/api';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { repoBranchKeys } from '@/hooks/useRepoBranches';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { GitProviderConnections } from './GitProviderConnections';
import type { Project, Repo, UpdateProject } from 'shared/types';

interface RepositoryPanelProps {
  project: Project | null;
}

export function RepositoryPanel({ project }: RepositoryPanelProps) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Project name editing state
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Repositories state
  const [repositories, setRepositories] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [addingRepo, setAddingRepo] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);

  // Sync project name when project changes
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setError(null);
      setSuccess(false);
    }
  }, [project]);

  // Fetch repositories when project changes
  useEffect(() => {
    if (!project?.id) {
      setRepositories([]);
      return;
    }

    setLoadingRepos(true);
    setRepoError(null);
    projectsApi
      .getRepositories(project.id)
      .then(setRepositories)
      .catch((err) => {
        setRepoError(
          err instanceof Error ? err.message : 'Failed to load repositories'
        );
        setRepositories([]);
      })
      .finally(() => setLoadingRepos(false));
  }, [project?.id]);

  const hasUnsavedChanges = project ? projectName !== project.name : false;

  const { updateProject } = useProjectMutations({
    onUpdateSuccess: () => {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSaving(false);
    },
    onUpdateError: (err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to save project settings'
      );
      setSaving(false);
    },
  });

  const handleSave = useCallback(async () => {
    if (!project || !hasUnsavedChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    const updateData: UpdateProject = {
      name: projectName.trim(),
      dev_script: null,
      dev_script_working_dir: null,
      default_agent_working_dir: null,
      priority: null,
      lead_id: null,
      start_date: null,
      target_date: null,
      status: null,
      health: null,
      description: null,
      summary: null,
      icon: null,
    };

    updateProject.mutate({
      projectId: project.id,
      data: updateData,
    });
  }, [project, projectName, hasUnsavedChanges, updateProject]);

  const handleDiscard = useCallback(() => {
    if (project) {
      setProjectName(project.name);
    }
  }, [project]);

  const handleAddRepository = useCallback(async () => {
    if (!project?.id) return;

    const repo = await RepoPickerDialog.show({
      title: 'Select Git Repository',
      description: 'Choose a git repository to add to this project',
    });

    if (!repo) return;
    if (repositories.some((r) => r.id === repo.id)) return;

    setAddingRepo(true);
    setRepoError(null);
    try {
      const newRepo = await projectsApi.addRepository(project.id, {
        display_name: repo.display_name,
        git_repo_path: repo.path,
      });
      setRepositories((prev) => [...prev, newRepo]);
      queryClient.invalidateQueries({
        queryKey: ['projectRepositories', project.id],
        refetchType: 'none',
      });
      queryClient.invalidateQueries({
        queryKey: repoBranchKeys.byRepo(newRepo.id),
        refetchType: 'none',
      });
    } catch (err) {
      setRepoError(
        err instanceof Error ? err.message : 'Failed to add repository'
      );
    } finally {
      setAddingRepo(false);
    }
  }, [project?.id, repositories, queryClient]);

  const handleDeleteRepository = useCallback(
    async (repoId: string) => {
      if (!project?.id) return;

      setDeletingRepoId(repoId);
      setRepoError(null);
      try {
        await projectsApi.deleteRepository(project.id, repoId);
        setRepositories((prev) => prev.filter((r) => r.id !== repoId));
        queryClient.invalidateQueries({
          queryKey: ['projectRepositories', project.id],
          refetchType: 'none',
        });
        queryClient.invalidateQueries({
          queryKey: repoBranchKeys.byRepo(repoId),
          refetchType: 'none',
        });
      } catch (err) {
        setRepoError(
          err instanceof Error ? err.message : 'Failed to delete repository'
        );
      } finally {
        setDeletingRepoId(null);
      }
    },
    [project?.id, queryClient]
  );

  // Empty state when no project is selected
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <FolderKanban className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">
          Select a Project
        </h3>
        <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm">
          Choose a project from the list to view and manage its repository
          mappings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 overflow-auto h-full">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.projects.save.success')}
          </AlertDescription>
        </Alert>
      )}

      {/* Project General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.projects.general.title')}</CardTitle>
          <CardDescription>
            {t('settings.projects.general.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">
              {t('settings.projects.general.name.label')}
            </Label>
            <Input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('settings.projects.general.name.placeholder')}
              required
            />
            <p className="text-sm text-muted-foreground">
              {t('settings.projects.general.name.helper')}
            </p>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-4 border-t">
            {hasUnsavedChanges ? (
              <span className="text-sm text-muted-foreground">
                {t('settings.projects.save.unsavedChanges')}
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDiscard}
                disabled={saving || !hasUnsavedChanges}
              >
                {t('settings.projects.save.discard')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('settings.projects.save.saving')}
                  </>
                ) : (
                  t('settings.projects.save.button')
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Repositories Section */}
      <Card>
        <CardHeader>
          <CardTitle>Repositories</CardTitle>
          <CardDescription>
            Manage the git repositories in this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Git Provider Connections */}
          <GitProviderConnections />

          {repoError && (
            <Alert variant="destructive">
              <AlertDescription>{repoError}</AlertDescription>
            </Alert>
          )}

          {loadingRepos ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading repositories...
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{repo.display_name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {repo.path}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRepository(repo.id)}
                    disabled={deletingRepoId === repo.id}
                    title="Delete repository"
                  >
                    {deletingRepoId === repo.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}

              {repositories.length === 0 && !loadingRepos && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  No repositories configured
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddRepository}
                disabled={addingRepo}
                className="w-full"
              >
                {addingRepo ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Add Repository
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
