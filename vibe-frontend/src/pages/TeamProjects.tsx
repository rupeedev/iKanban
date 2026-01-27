import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Plus,
  Loader2,
  AlertCircle,
  Circle,
  ChevronDown,
  RefreshCw,
  UserX,
  Pencil,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  ResizableTableHeaderCell,
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
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import { TargetDateCell } from '@/components/projects/TargetDateCell';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useTeamProjects } from '@/hooks/useTeamProjects';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTeams } from '@/hooks/useTeams';
import { useKeyCreate, Scope } from '@/keyboard';
import { getTeamSlug, getProjectSlug } from '@/lib/urlUtils';
import type { Project } from 'shared/types';
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
  const option =
    PRIORITY_OPTIONS.find((o) => o.value === (priority ?? 0)) ||
    PRIORITY_OPTIONS[0];
  return option;
}

function getHealthDisplay(health: number | null | undefined) {
  const option =
    HEALTH_OPTIONS.find((o) => o.value === (health ?? 0)) || HEALTH_OPTIONS[0];
  return option;
}

const getInitials = (name: string | null | undefined) =>
  name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

// Lead cell component
type MemberInfo = {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
};

function LeadCell({
  leadId,
  members,
  onSelect,
}: {
  leadId: string | null;
  members: MemberInfo[];
  onSelect: (id: string | null) => void;
}) {
  const lead = leadId ? members.find((m) => m.id === leadId) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {lead ? (
            <>
              <Avatar className="h-5 w-5">
                <AvatarImage src={lead.avatar_url || ''} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(lead.display_name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline truncate max-w-[80px]">
                {lead.display_name || lead.email}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-60 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
          }}
        >
          <UserX className="h-4 w-4 mr-2 text-muted-foreground" />
          No lead
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m.id);
            }}
          >
            <Avatar className="h-5 w-5 mr-2">
              <AvatarImage src={m.avatar_url || ''} />
              <AvatarFallback className="text-[10px]">
                {getInitials(m.display_name)}
              </AvatarFallback>
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      className="transform -rotate-90"
    >
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

// Editable name cell component
interface EditableNameCellProps {
  project: Project;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function EditableNameCell({
  project,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
}: EditableNameCellProps) {
  const [value, setValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setValue(project.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isEditing, project.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) {
        onSave(value.trim());
      } else {
        onCancel();
      }
    } else if (e.key === 'Escape') {
      setValue(project.name);
      onCancel();
    }
  };

  const handleBlur = () => {
    if (value.trim() && value.trim() !== project.name) {
      onSave(value.trim());
    } else {
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-lg">{project.icon || '📁'}</span>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="h-7 text-sm w-full max-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group/name">
      <span className="text-lg">{project.icon || '📁'}</span>
      <span>{project.name}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover/name:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
        aria-label="Edit project name"
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  name: 250,
  health: 130,
  priority: 130,
  lead: 150,
  targetDate: 130,
  status: 100,
};

export function TeamProjects() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { resolveTeam } = useTeams();
  const team = teamId ? resolveTeam(teamId) : undefined;
  const actualTeamId = team?.id;

  const { projects, isLoading, error, refetch, isFetching } =
    useTeamProjects(actualTeamId);
  const { issues } = useTeamIssues(actualTeamId);
  const { members } = useTeamMembers(actualTeamId);
  const { updateProject, deleteProject } = useProjectMutations();

  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  // Currently editing project ID
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Calculate issue stats per project
  const projectStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; done: number; percentage: number }
    > = {};

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
      stats[projectId].percentage =
        total > 0 ? Math.round((done / total) * 100) : 0;
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

  // Handler for column resize
  const handleColumnResize = (
    column: keyof typeof DEFAULT_COLUMN_WIDTHS,
    width: number
  ) => {
    setColumnWidths((prev) => ({ ...prev, [column]: width }));
  };

  // Handler for saving project name
  const handleSaveProjectName = (project: Project, newName: string) => {
    if (newName !== project.name) {
      updateProject.mutate({
        projectId: project.id,
        data: {
          name: newName,
          dev_script: null,
          dev_script_working_dir: null,
          default_agent_working_dir: null,
          priority: project.priority,
          lead_id: project.lead_id,
          start_date: project.start_date,
          target_date: project.target_date,
          status: project.status,
          health: project.health,
          description: project.description,
          summary: project.summary,
          icon: project.icon,
        },
      });
    }
    setEditingProjectId(null);
  };

  // Inline update handler for dropdowns
  const handleFieldChange = (
    project: Project,
    field: 'health' | 'priority' | 'lead_id' | 'target_date',
    value: number | string | null
  ) => {
    updateProject.mutate({
      projectId: project.id,
      data: {
        name: project.name,
        dev_script: null,
        dev_script_working_dir: null,
        default_agent_working_dir: null,
        priority: field === 'priority' ? (value as number) : project.priority,
        lead_id:
          field === 'lead_id' ? (value as string | null) : project.lead_id,
        start_date: project.start_date,
        target_date:
          field === 'target_date'
            ? (value as string | null)
            : project.target_date,
        status: project.status,
        health: field === 'health' ? (value as number) : project.health,
        description: project.description,
        summary: project.summary,
        icon: project.icon,
      },
    });
  };

  // Delete project handler with confirmation
  const handleDeleteProject = async (project: Project) => {
    const confirmed = await ConfirmDialog.show({
      title: 'Delete project',
      message: `Are you sure you want to delete "${project.name}"? This action cannot be undone and will remove all associated tasks.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (confirmed === 'confirmed') {
      try {
        await deleteProject.mutateAsync(project.id);
      } catch {
        // Error already logged by mutation onError
      }
    }
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
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
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
          <Table className="table-fixed">
            <TableHead>
              <TableRow>
                <ResizableTableHeaderCell
                  width={columnWidths.name}
                  minWidth={150}
                  onResize={(w: number) => handleColumnResize('name', w)}
                  className="py-2 px-4"
                >
                  Name
                </ResizableTableHeaderCell>
                <ResizableTableHeaderCell
                  width={columnWidths.health}
                  minWidth={100}
                  onResize={(w: number) => handleColumnResize('health', w)}
                  className="py-2 px-4"
                >
                  Health
                </ResizableTableHeaderCell>
                <ResizableTableHeaderCell
                  width={columnWidths.priority}
                  minWidth={100}
                  onResize={(w: number) => handleColumnResize('priority', w)}
                  className="py-2 px-4"
                >
                  Priority
                </ResizableTableHeaderCell>
                <ResizableTableHeaderCell
                  width={columnWidths.lead}
                  minWidth={100}
                  onResize={(w: number) => handleColumnResize('lead', w)}
                  className="py-2 px-4"
                >
                  Lead
                </ResizableTableHeaderCell>
                <ResizableTableHeaderCell
                  width={columnWidths.targetDate}
                  minWidth={100}
                  onResize={(w: number) => handleColumnResize('targetDate', w)}
                  className="py-2 px-4"
                >
                  Target date
                </ResizableTableHeaderCell>
                <ResizableTableHeaderCell
                  width={columnWidths.status}
                  minWidth={80}
                  onResize={(w: number) => handleColumnResize('status', w)}
                  className="py-2 px-4"
                >
                  Status
                </ResizableTableHeaderCell>
                <th className="py-2 px-4 w-10" />
              </TableRow>
            </TableHead>
            <TableBody>
              {projects.map((project) => {
                const priority = getPriorityDisplay(project.priority);
                const health = getHealthDisplay(project.health);

                const isEditing = editingProjectId === project.id;

                return (
                  <TableRow
                    key={project.id}
                    clickable={!isEditing}
                    onClick={() => !isEditing && handleProjectClick(project)}
                  >
                    {/* Name */}
                    <TableCell
                      className="font-medium"
                      bordered
                      style={{ width: columnWidths.name }}
                    >
                      <EditableNameCell
                        project={project}
                        isEditing={isEditing}
                        onStartEdit={() => setEditingProjectId(project.id)}
                        onSave={(name) => handleSaveProjectName(project, name)}
                        onCancel={() => setEditingProjectId(null)}
                      />
                    </TableCell>

                    {/* Health */}
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      bordered
                      style={{ width: columnWidths.health }}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Circle
                              className={`h-2 w-2 fill-current ${health.color}`}
                            />
                            <span className="hidden sm:inline">
                              {health.label}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {HEALTH_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() =>
                                handleFieldChange(
                                  project,
                                  'health',
                                  option.value
                                )
                              }
                            >
                              <Circle
                                className={`h-2 w-2 mr-2 fill-current ${option.color}`}
                              />
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Priority */}
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      bordered
                      style={{ width: columnWidths.priority }}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>{priority.icon}</span>
                            <span className="hidden sm:inline">
                              {priority.label}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {PRIORITY_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option.value}
                              onClick={() =>
                                handleFieldChange(
                                  project,
                                  'priority',
                                  option.value
                                )
                              }
                            >
                              <span className="mr-2">{option.icon}</span>
                              {option.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    {/* Lead */}
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      bordered
                      style={{ width: columnWidths.lead }}
                    >
                      <LeadCell
                        leadId={project.lead_id}
                        members={members}
                        onSelect={(id) =>
                          handleFieldChange(project, 'lead_id', id)
                        }
                      />
                    </TableCell>

                    {/* Target date */}
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      bordered
                      style={{ width: columnWidths.targetDate }}
                    >
                      <TargetDateCell
                        targetDate={project.target_date}
                        onSelect={(date) =>
                          handleFieldChange(project, 'target_date', date)
                        }
                      />
                    </TableCell>

                    {/* Status - Completion Percentage */}
                    <TableCell style={{ width: columnWidths.status }}>
                      <div className="flex items-center gap-2">
                        <ProgressCircle
                          percentage={projectStats[project.id]?.percentage || 0}
                        />
                        <span
                          className={cn(
                            'text-sm font-medium',
                            projectStats[project.id]?.percentage === 100
                              ? 'text-green-500'
                              : 'text-muted-foreground'
                          )}
                        >
                          {projectStats[project.id]?.percentage || 0}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell
                      className="w-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={deleteProject.isPending}
                          >
                            {deleteProject.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDeleteProject(project)}
                            className="text-destructive focus:text-destructive"
                            disabled={deleteProject.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
