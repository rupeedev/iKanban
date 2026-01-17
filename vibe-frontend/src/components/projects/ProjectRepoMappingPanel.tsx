import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Github,
  GitlabIcon,
  Loader2,
  Plus,
  Trash2,
  Unlink,
  Search,
  ChevronDown,
  ChevronRight,
  FolderGit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useQueries } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type {
  Project,
  Repo,
  Team,
  GitHubConnectionWithRepos,
  GitLabConnectionWithRepos,
} from 'shared/types';

interface ProjectRepoMappingPanelProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  repositories: Repo[];
  loadingRepos: boolean;
  repoError: string | null;
  addingRepo: boolean;
  deletingRepoId: string | null;
  onAddRepo: () => void;
  onDeleteRepo: (repoId: string) => void;
  githubConnection: GitHubConnectionWithRepos | null | undefined;
  gitlabConnection: GitLabConnectionWithRepos | null | undefined;
  onConnectGitHub: () => void;
  onConnectGitLab: () => void;
  onDisconnectGitHub: () => void;
  onDisconnectGitLab: () => void;
}

interface TeamProjectGroup {
  team: Team | null;
  projects: Project[];
}

export function ProjectRepoMappingPanel({
  selectedProjectId,
  onSelectProject,
  repositories,
  loadingRepos,
  repoError,
  addingRepo,
  deletingRepoId,
  onAddRepo,
  onDeleteRepo,
  githubConnection,
  gitlabConnection,
  onConnectGitHub,
  onConnectGitLab,
  onDisconnectGitHub,
  onDisconnectGitLab,
}: ProjectRepoMappingPanelProps) {
  const { t } = useTranslation('settings');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>(
    {}
  );

  // Fetch all projects
  const { projects, isLoading: projectsLoading } = useProjects();

  // Fetch all teams
  const { teams, isLoading: teamsLoading } = useTeams();

  // Fetch project IDs for each team
  const teamProjectQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ['teams', team.id, 'projectIds'],
      queryFn: () => teamsApi.getProjects(team.id),
      enabled: !teamsLoading && teams.length > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Build project → team mapping
  const projectToTeam = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((team, index) => {
      const projectIds = teamProjectQueries[index]?.data ?? [];
      projectIds.forEach((projectId: string) => {
        if (!map[projectId]) {
          map[projectId] = team;
        }
      });
    });
    return map;
  }, [teams, teamProjectQueries]);

  // Group projects by team
  const projectsByTeam = useMemo((): TeamProjectGroup[] => {
    const grouped: TeamProjectGroup[] = [];
    const teamMap = new Map<string | null, Project[]>();

    projects.forEach((project) => {
      const team = projectToTeam[project.id];
      const teamId = team?.id ?? null;
      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, []);
      }
      teamMap.get(teamId)!.push(project);
    });

    // Sort teams alphabetically
    const sortedTeamIds = Array.from(teamMap.keys()).sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      const teamA = teams.find((t) => t.id === a);
      const teamB = teams.find((t) => t.id === b);
      return (teamA?.name ?? '').localeCompare(teamB?.name ?? '');
    });

    sortedTeamIds.forEach((teamId) => {
      const teamProjects = teamMap.get(teamId) ?? [];
      const team = teamId ? (teams.find((t) => t.id === teamId) ?? null) : null;
      grouped.push({ team, projects: teamProjects });
    });

    return grouped;
  }, [projects, projectToTeam, teams]);

  // Filter projects by search query
  const filteredProjectsByTeam = useMemo(() => {
    if (!searchQuery.trim()) return projectsByTeam;

    const query = searchQuery.toLowerCase();
    return projectsByTeam
      .map((group) => ({
        ...group,
        projects: group.projects.filter((p) =>
          p.name.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.projects.length > 0);
  }, [projectsByTeam, searchQuery]);

  // Track repo counts per project (we only have count for selected project)
  // For now, show count only for selected project
  const getRepoCount = useCallback(
    (projectId: string) => {
      if (projectId === selectedProjectId) {
        return repositories.length;
      }
      return null; // Unknown for non-selected projects
    },
    [selectedProjectId, repositories]
  );

  const toggleTeam = useCallback((teamId: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  // Auto-expand teams on initial load (use ref to track if already initialized)
  const hasInitializedExpandedTeams = useRef(false);
  useEffect(() => {
    if (
      !hasInitializedExpandedTeams.current &&
      projectsByTeam.length > 0
    ) {
      hasInitializedExpandedTeams.current = true;
      const initial: Record<string, boolean> = {};
      projectsByTeam.forEach((group) => {
        const teamId = group.team?.id ?? 'other';
        initial[teamId] = true;
      });
      setExpandedTeams(initial);
    }
  }, [projectsByTeam]);

  if (projectsLoading || teamsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">
          {t('settings.projects.loading')}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[400px]">
      {/* Left Panel: Project List */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
        <div className="p-3 border-b bg-muted/30">
          <h3 className="text-sm font-medium mb-2">Projects</h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredProjectsByTeam.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchQuery
                ? 'No projects match your search'
                : 'No projects available'}
            </div>
          ) : (
            <div className="py-1">
              {filteredProjectsByTeam.map((group) => {
                const teamId = group.team?.id ?? 'other';
                const isExpanded = expandedTeams[teamId] ?? true;

                return (
                  <div key={teamId} className="mb-1">
                    {/* Team Header */}
                    <button
                      onClick={() => toggleTeam(teamId)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {group.team
                          ? `${group.team.icon ?? '👥'} ${group.team.name}`
                          : 'Other Projects'}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground/70">
                        ({group.projects.length})
                      </span>
                    </button>

                    {/* Project List */}
                    {isExpanded && (
                      <div className="ml-2">
                        {group.projects.map((project) => {
                          const repoCount = getRepoCount(project.id);
                          const isSelected = project.id === selectedProjectId;

                          return (
                            <button
                              key={project.id}
                              onClick={() => onSelectProject(project.id)}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors rounded-sm',
                                isSelected
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'hover:bg-muted/50'
                              )}
                            >
                              <FolderGit2
                                className={cn(
                                  'h-4 w-4 flex-shrink-0',
                                  isSelected
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                )}
                              />
                              <span className="truncate flex-1">
                                {project.name}
                              </span>
                              {repoCount !== null && (
                                <span
                                  className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded-full',
                                    isSelected
                                      ? 'bg-primary/20 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  )}
                                >
                                  {repoCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Repository Details */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
        {!selectedProjectId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <FolderGit2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Select a project to view and manage its repositories
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-3 border-b bg-muted/30">
              <h3 className="text-sm font-medium">
                Repositories: {selectedProject?.name}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Git Provider Connections */}
              <div className="space-y-2">
                {/* GitHub */}
                <div className="p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      <span className="text-sm font-medium">GitHub</span>
                    </div>
                    {githubConnection?.github_username ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          @{githubConnection.github_username}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onDisconnectGitHub}
                          title="Disconnect GitHub"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onConnectGitHub}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>

                {/* GitLab */}
                <div className="p-3 border rounded-md bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitlabIcon className="h-4 w-4" />
                      <span className="text-sm font-medium">GitLab</span>
                    </div>
                    {gitlabConnection?.connection?.gitlab_username ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          @{gitlabConnection.connection.gitlab_username}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onDisconnectGitLab}
                          title="Disconnect GitLab"
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onConnectGitLab}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Alert */}
              {repoError && (
                <Alert variant="destructive">
                  <AlertDescription>{repoError}</AlertDescription>
                </Alert>
              )}

              {/* Repository List */}
              {loadingRepos ? (
                <div className="flex items-center justify-center py-8">
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
                        <div className="font-medium text-sm">
                          {repo.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {repo.path}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteRepo(repo.id)}
                        disabled={deletingRepoId === repo.id}
                        title="Remove repository"
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
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No repositories configured
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddRepo}
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
