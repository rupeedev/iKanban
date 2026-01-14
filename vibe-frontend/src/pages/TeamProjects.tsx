import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Plus, Loader2, AlertCircle, Circle, ChevronDown, RefreshCw, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useTeamProjects } from '@/hooks/useTeamProjects';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTeams } from '@/hooks/useTeams';
import { useKeyCreate, Scope } from '@/keyboard';
import { getTeamSlug, getProjectSlug } from '@/lib/url-utils';
import type { Project } from 'shared/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const PRIORITY_OPTIONS = [
  { value: 0, label: 'No priority', icon: '—' },
  { value: 1, label: 'Urgent', icon: '🔴' },
  { value: 2, label: 'High', icon: '🟠' },
  { value: 3, label: 'Medium', icon: '🟡' },
  { value: 4, label: 'Low', icon: '🟢' },
];

const HEALTH_OPTIONS = [
  { value: 0, label: 'No update', color: 'text-gray-400' },
  { value: 1, label: 'On track', color: 'text-green-500' },
  { value: 2, label: 'At risk', color: 'text-yellow-500' },
  { value: 3, label: 'Off track', color: 'text-red-500' },
];

function getPriorityDisplay(priority: number | null | undefined) {
  const option = PRIORITY_OPTIONS.find(o => o.value === (priority ?? 0)) || PRIORITY_OPTIONS[0];
  return option;
}

function getHealthDisplay(health: number | null | undefined) {
  const option = HEALTH_OPTIONS.find(o => o.value === (health ?? 0)) || HEALTH_OPTIONS[0];
  return option;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return '—';
  }
}

const getInitials = (name: string | null | undefined) =>
  name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

// Lead cell component
type MemberInfo = { id: string; display_name: string | null; email: string; avatar_url: string | null };

function LeadCell({ leadId, members, onSelect }: { leadId: string | null; members: MemberInfo[]; onSelect: (id: string | null) => void }) {
  const lead = leadId ? members.find(m => m.id === leadId) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-2 text-xs">
          {lead ? (
            <>
              <Avatar className="h-5 w-5">
                <AvatarImage src={lead.avatar_url || ''} />
                <AvatarFallback className="text-[10px]">{getInitials(lead.display_name)}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline truncate max-w-[80px]">{lead.display_name || lead.email}</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        <DropdownMenuItem onClick={() => onSelect(null)}>
          <UserX className="h-4 w-4 mr-2 text-muted-foreground" />No lead
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => onSelect(m.id)}>
            <Avatar className="h-5 w-5 mr-2">
              <AvatarImage src={m.avatar_url || ''} />
              <AvatarFallback className="text-[10px]">{getInitials(m.display_name)}</AvatarFallback>
            </Avatar>
            {m.display_name || m.email}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Progress circle component for status percentage
function ProgressCircle({ percentage }: { percentage: number }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on completion
  const getColor = (pct: number) => {
    if (pct === 100) return 'stroke-green-500';
    if (pct >= 75) return 'stroke-green-400';
    if (pct >= 50) return 'stroke-yellow-500';
    if (pct >= 25) return 'stroke-orange-400';
    return 'stroke-orange-300';
  };

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-muted-foreground/20"
      />
      {/* Progress circle */}
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className={getColor(percentage)}
      />
    </svg>
  );
}

export function TeamProjects() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { resolveTeam } = useTeams();
  const team = teamId ? resolveTeam(teamId) : undefined;
  const actualTeamId = team?.id;

  const { projects, isLoading, error, refetch, isFetching } = useTeamProjects(actualTeamId);
  const { issues } = useTeamIssues(actualTeamId);
  const { members } = useTeamMembers(actualTeamId);
  const { updateProject } = useProjectMutations();

  // Calculate issue stats per project
  const projectStats = useMemo(() => {
    const stats: Record<string, { total: number; done: number; percentage: number }> = {};

    // Initialize all projects with zero counts
    projects.forEach((project) => {
      stats[project.id] = { total: 0, done: 0, percentage: 0 };
    });

    // Count issues per project
    issues.forEach((issue) => {
      if (issue.project_id && stats[issue.project_id]) {
        stats[issue.project_id].total++;
        if (issue.status === 'done') {
          stats[issue.project_id].done++;
        }
      }
    });

    // Calculate percentages
    Object.keys(stats).forEach((projectId) => {
      const { total, done } = stats[projectId];
      stats[projectId].percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    });

    return stats;
  }, [projects, issues]);

  const handleCreateProject = async () => {
    try {
      const result = await ProjectFormDialog.show({ teamId: actualTeamId });
      if (result === 'saved') return;
    } catch {
      // User cancelled
    }
  };

  const handleProjectClick = (project: Project) => {
    const teamSlug = team ? getTeamSlug(team) : teamId;
    navigate(`/teams/${teamSlug}/projects/${getProjectSlug(project)}`);
  };

  // Inline update handler for dropdowns
  const handleFieldChange = (project: Project, field: 'health' | 'priority' | 'lead_id', value: number | string | null) => {
    updateProject.mutate({
      projectId: project.id,
      data: {
        name: project.name,
        dev_script: null,
        dev_script_working_dir: null,
        default_agent_working_dir: null,
        priority: field === 'priority' ? (value as number) : project.priority,
        lead_id: field === 'lead_id' ? (value as string | null) : project.lead_id,
        start_date: project.start_date,
        target_date: project.target_date,
        status: project.status,
        health: field === 'health' ? (value as number) : project.health,
        description: project.description,
        summary: project.summary,
        icon: project.icon,
      },
    });
  };

  useKeyCreate(handleCreateProject, { scope: Scope.PROJECTS });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">
            {team?.name || 'Team'} Projects
          </h1>
          <Badge variant="secondary" className="text-xs">
            {projects.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreateProject}>
            <Plus className="h-4 w-4 mr-1" />
            New project
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to get started
            </p>
            <Button onClick={handleCreateProject}>
              <Plus className="h-4 w-4 mr-1" />
              New project
            </Button>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-[300px] py-2 px-4">Name</TableHeaderCell>
                <TableHeaderCell className="w-[100px] py-2 px-4">Health</TableHeaderCell>
                <TableHeaderCell className="w-[100px] py-2 px-4">Priority</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Lead</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Target date</TableHeaderCell>
                <TableHeaderCell className="w-[120px] py-2 px-4">Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((project) => {
                const priority = getPriorityDisplay(project.priority);
                const health = getHealthDisplay(project.health);

                return (
                  <TableRow
                    key={project.id}
                    clickable
                    onClick={() => handleProjectClick(project)}
                  >
                    {/* Name */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{project.icon || '📁'}</span>
                        <span>{project.name}</span>
                      </div>
                    </TableCell>

                    {/* Health */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                          >
                            <Circle className={`h-2 w-2 fill-current ${health.color}`} />
                            <span className="hidden sm:inline">{health.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {HEALTH_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => handleFieldChange(project, 'health', option.value)}
                            >
                              <Circle className={`h-2 w-2 mr-2 fill-current ${option.color}`} />
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Priority */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                          >
                            <span>{priority.icon}</span>
                            <span className="hidden sm:inline">{priority.label}</span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {PRIORITY_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() => handleFieldChange(project, 'priority', option.value)}
                            >
                              <span className="mr-2">{option.icon}</span>
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Lead */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <LeadCell
                        leadId={project.lead_id}
                        members={members}
                        onSelect={(id) => handleFieldChange(project, 'lead_id', id)}
                      />
                    </TableCell>

                    {/* Target date */}
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(project.target_date)}
                    </TableCell>

                    {/* Status - Completion Percentage */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressCircle percentage={projectStats[project.id]?.percentage || 0} />
                        <span className={cn(
                          'text-sm font-medium',
                          projectStats[project.id]?.percentage === 100
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                        )}>
                          {projectStats[project.id]?.percentage || 0}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
