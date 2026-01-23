import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Loader2, FolderKanban, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { teamsApi } from '@/lib/api';
import type { Project, Team } from 'shared/types';

interface RippleState {
  x: number;
  y: number;
  id: number;
}

interface ProjectListPanelProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

export function ProjectListPanel({
  selectedProjectId,
  onSelectProject,
}: ProjectListPanelProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { teams, isLoading: teamsLoading } = useTeams();
  const [ripples, setRipples] = useState<Record<string, RippleState[]>>({});
  const rippleIdRef = useRef(0);

  // Fetch project IDs for each team (to build project → team mapping)
  const teamProjectQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ['teams', team.id, 'projectIds'],
      queryFn: () => teamsApi.getProjects(team.id),
      enabled: !teamsLoading && teams.length > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Build a map: projectId → team
  const projectToTeam = useMemo(() => {
    const map: Record<string, Team> = {};
    teams.forEach((team, index) => {
      const teamProjects = teamProjectQueries[index]?.data ?? [];
      teamProjects.forEach((project) => {
        if (!map[project.id]) {
          map[project.id] = team;
        }
      });
    });
    return map;
  }, [teams, teamProjectQueries]);

  // Group projects by team
  const projectsByTeam = useMemo(() => {
    const grouped: { team: Team | null; projects: Project[] }[] = [];
    const teamMap = new Map<string | null, Project[]>();

    projects.forEach((project) => {
      const team = projectToTeam[project.id];
      const teamId = team?.id ?? null;
      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, []);
      }
      teamMap.get(teamId)!.push(project);
    });

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

  const handleProjectClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, projectId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = ++rippleIdRef.current;

      setRipples((prev) => ({
        ...prev,
        [projectId]: [...(prev[projectId] ?? []), { x, y, id }],
      }));

      setTimeout(() => {
        setRipples((prev) => ({
          ...prev,
          [projectId]: (prev[projectId] ?? []).filter((r) => r.id !== id),
        }));
      }, 600);

      onSelectProject(projectId);
    },
    [onSelectProject]
  );

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No projects found</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Create a project to get started
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2">
        {projectsByTeam.map(({ team, projects: teamProjects }) => (
          <Collapsible key={team?.id ?? 'unassigned'} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors group">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {team ? `${team.icon ?? '👥'} ${team.name}` : 'Other Projects'}
              </span>
              <span className="ml-auto text-xs text-muted-foreground/70">
                {teamProjects.length}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1 mt-1 ml-3">
                {teamProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={(e) => handleProjectClick(e, project.id)}
                    className={cn(
                      'relative w-full text-left px-3 py-2.5 rounded-md transition-colors overflow-hidden',
                      'hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedProjectId === project.id
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground min-w-[32px]">
                        {projectToTeam[project.id]?.identifier ?? '—'}
                      </span>
                      <span className="truncate">{project.name}</span>
                    </div>
                    {/* Ripple effects */}
                    {(ripples[project.id] ?? []).map((ripple) => (
                      <span
                        key={ripple.id}
                        className="absolute pointer-events-none rounded-full bg-primary/20 animate-ripple"
                        style={{
                          left: ripple.x,
                          top: ripple.y,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    ))}
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </ScrollArea>
  );
}
