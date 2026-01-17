import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Calendar,
  ArrowRight,
  Users,
  Tag,
  User,
  Check,
  UserPlus,
  Mail,
  GitCommit,
  GitBranch,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useProjectRepos } from '@/hooks/useProjectRepos';
import { tasksApi, projectsApi } from '@/lib/api';
import { ProjectInsightsPanel } from '@/components/projects/ProjectInsightsPanel';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { toast } from 'sonner';
import { IssueFormDialog } from '@/components/dialogs/issues/IssueFormDialog';
import { StatusIcon } from '@/utils/StatusIcons';
import { statusLabels } from '@/utils/statusLabels';
import {
  IssueFilterDropdown,
  type FilterState,
} from '@/components/filters/IssueFilterDropdown';
import {
  DisplayOptionsDropdown,
  type DisplayOptions,
} from '@/components/filters/DisplayOptionsDropdown';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// Status groups in display order
const STATUS_ORDER: TaskStatus[] = [
  'done',
  'inreview',
  'inprogress',
  'todo',
  'cancelled',
];

// Priority display
const PRIORITY_DISPLAY = [
  { value: 0, label: 'No priority', dots: '---' },
  { value: 1, label: 'Urgent', dots: '!!!' },
  { value: 2, label: 'High', dots: '.!!' },
  { value: 3, label: 'Medium', dots: '..!' },
  { value: 4, label: 'Low', dots: '...' },
];

// Team member type for assignee dropdown
interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

// Mock team members - in real app, fetch from API
const MOCK_TEAM_MEMBERS: TeamMember[] = [
  { id: '1', name: 'rupesh panwar', email: 'rupesh@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com' },
];

function getPriorityDots(priority: number | null | undefined) {
  const p =
    PRIORITY_DISPLAY.find((d) => d.value === (priority ?? 0)) ||
    PRIORITY_DISPLAY[0];
  return p.dots;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return null;
  }
}

// Generate issue key from team identifier and issue number
function getIssueKey(
  teamIdentifier: string | null | undefined,
  issueNumber: number | null | undefined
) {
  if (!teamIdentifier || !issueNumber) return null;
  return `${teamIdentifier}-${issueNumber}`;
}

interface IssueRowProps {
  issue: TaskWithAttemptStatus;
  teamIdentifier?: string;
  onClick: () => void;
  teamMembers: TeamMember[];
  issueCountPerAssignee: Record<string | 'unassigned', number>;
  onAssigneeChange: (issueId: string, assigneeId: string | null) => void;
}

function IssueRow({
  issue,
  teamIdentifier,
  onClick,
  teamMembers,
  issueCountPerAssignee,
  onAssigneeChange,
}: IssueRowProps) {
  const issueKey = getIssueKey(teamIdentifier, issue.issue_number);
  const selectedMember = teamMembers.find((m) => m.id === issue.assignee_id);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAssigneeSelect = useCallback(
    (assigneeId: string | null) => {
      onAssigneeChange(issue.id, assigneeId);
    },
    [issue.id, onAssigneeChange]
  );

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 cursor-pointer border-b border-border/30 last:border-b-0"
    >
      {/* Priority dots */}
      <span className="text-xs text-muted-foreground font-mono w-8">
        {getPriorityDots(issue.priority)}
      </span>

      {/* Issue key */}
      {issueKey && (
        <span className="text-xs text-muted-foreground font-mono w-16">
          {issueKey}
        </span>
      )}

      {/* Status icon */}
      <StatusIcon status={issue.status} className="h-4 w-4 flex-shrink-0" />

      {/* Title */}
      <span className="flex-1 text-sm truncate">{issue.title}</span>

      {/* Assignee Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              'h-6 w-6 rounded-full flex items-center justify-center',
              'border border-dashed border-muted-foreground/40',
              'text-muted-foreground hover:border-primary hover:text-primary',
              'transition-colors'
            )}
          >
            {selectedMember ? (
              selectedMember.avatar ? (
                <img
                  src={selectedMember.avatar}
                  alt={selectedMember.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs font-medium">
                  {getInitials(selectedMember.name)}
                </span>
              )
            ) : (
              <User className="h-3 w-3" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
        >
          {/* No assignee option */}
          <DropdownMenuItem
            onClick={() => handleAssigneeSelect(null)}
            className={cn(
              'cursor-pointer gap-2',
              !issue.assignee_id && 'bg-accent'
            )}
          >
            <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
              <User className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="flex-1">No assignee</span>
            {!issue.assignee_id && <Check className="h-4 w-4 text-primary" />}
            <span className="text-xs text-muted-foreground">
              {issueCountPerAssignee['unassigned'] || 0}
            </span>
          </DropdownMenuItem>

          {teamMembers.length > 0 && <DropdownMenuSeparator />}

          {/* Team members */}
          {teamMembers.map((member) => {
            const isSelected = issue.assignee_id === member.id;
            return (
              <DropdownMenuItem
                key={member.id}
                onClick={() => handleAssigneeSelect(member.id)}
                className={cn(
                  'cursor-pointer gap-2',
                  isSelected && 'bg-accent'
                )}
              >
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center text-xs">
                    {getInitials(member.name)}
                  </div>
                )}
                <span className="flex-1 truncate">{member.name}</span>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
                <span className="text-xs text-muted-foreground">
                  {issueCountPerAssignee[member.id] || 0}
                </span>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          {/* New user option */}
          <DropdownMenuItem className="cursor-pointer gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span>New user</span>
          </DropdownMenuItem>

          {/* Invite option */}
          <DropdownMenuItem className="cursor-pointer gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>Invite and assign...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date */}
      <span className="text-xs text-muted-foreground w-16 text-right">
        {formatDate(issue.created_at)}
      </span>
    </div>
  );
}

interface StatusGroupProps {
  status: TaskStatus;
  issues: TaskWithAttemptStatus[];
  teamIdentifier?: string;
  teamMembers: TeamMember[];
  issueCountPerAssignee: Record<string | 'unassigned', number>;
  onIssueClick: (issue: TaskWithAttemptStatus) => void;
  onAddIssue: () => void;
  onAssigneeChange: (issueId: string, assigneeId: string | null) => void;
}

function StatusGroup({
  status,
  issues,
  teamIdentifier,
  teamMembers,
  issueCountPerAssignee,
  onIssueClick,
  onAddIssue,
  onAssigneeChange,
}: StatusGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (issues.length === 0) return null;

  return (
    <div className="border-b border-border/50">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-accent/30 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <StatusIcon status={status} />
        <span className="font-medium text-sm">{statusLabels[status]}</span>
        <span className="text-sm text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddIssue();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Issues */}
      {isExpanded && (
        <div className="bg-muted/20">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              teamIdentifier={teamIdentifier}
              teamMembers={teamMembers}
              issueCountPerAssignee={issueCountPerAssignee}
              onClick={() => onIssueClick(issue)}
              onAssigneeChange={onAssigneeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Generic group component for non-status grouping (priority, assignee)
interface GenericGroupProps {
  title: string;
  issues: TaskWithAttemptStatus[];
  teamIdentifier?: string;
  teamMembers: TeamMember[];
  issueCountPerAssignee: Record<string | 'unassigned', number>;
  onIssueClick: (issue: TaskWithAttemptStatus) => void;
  onAddIssue: () => void;
  onAssigneeChange: (issueId: string, assigneeId: string | null) => void;
}

function GenericGroup({
  title,
  issues,
  teamIdentifier,
  teamMembers,
  issueCountPerAssignee,
  onIssueClick,
  onAddIssue,
  onAssigneeChange,
}: GenericGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (issues.length === 0) return null;

  return (
    <div className="border-b border-border/50">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-accent/30 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{title}</span>
        <span className="text-sm text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddIssue();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Issues */}
      {isExpanded && (
        <div className="bg-muted/20">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              teamIdentifier={teamIdentifier}
              teamMembers={teamMembers}
              issueCountPerAssignee={issueCountPerAssignee}
              onClick={() => onIssueClick(issue)}
              onAssigneeChange={onAssigneeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamProjectDetail() {
  const { teamId, projectId } = useParams<{
    teamId: string;
    projectId: string;
  }>();
  const navigate = useNavigate();
  const { resolveTeam } = useTeams();
  const { resolveProject, isLoading: projectsLoading } = useProjects();
  const team = teamId ? resolveTeam(teamId) : null;
  const project = projectId ? resolveProject(projectId) : null;
  const actualTeamId = team?.id;

  const {
    issues,
    isLoading: issuesLoading,
    refresh: refreshIssues,
  } = useTeamIssues(actualTeamId);
  const [activeTab, setActiveTab] = useState('overview');
  const [activityExpanded, setActivityExpanded] = useState(true);
  const [isDeletingRepo, setIsDeletingRepo] = useState<string | null>(null);

  // Filter and display state
  const [filters, setFilters] = useState<FilterState>({
    priority: null,
    assigneeId: null,
    projectId: null,
  });
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>({
    groupBy: 'status',
    sortBy: 'created',
    sortDirection: 'desc',
  });

  // Project repositories
  const { data: projectRepos = [], refetch: refetchRepos } = useProjectRepos(
    project?.id
  );

  // Handle adding a repository via dialog
  const handleOpenRepoDialog = useCallback(async () => {
    if (!project?.id) return;
    try {
      const result = await RepoPickerDialog.show({
        title: 'Link Repository',
        description:
          'Select a repository to link to this project for AI agent execution.',
      });
      if (result && result.path && result.display_name) {
        await projectsApi.addRepository(project.id, {
          git_repo_path: result.path,
          display_name: result.display_name,
        });
        await refetchRepos();
        toast.success('Repository linked', {
          description: `${result.display_name} has been linked to this project.`,
        });
      }
    } catch (err) {
      // User cancelled the dialog - not an error
      if (err !== undefined) {
        console.error('Failed to add repository:', err);
        toast.error('Failed to link repository');
      }
    }
  }, [project?.id, refetchRepos]);

  // Handle removing a repository
  const handleRemoveRepo = useCallback(
    async (repoId: string) => {
      if (!project?.id) return;
      setIsDeletingRepo(repoId);
      try {
        await projectsApi.deleteRepository(project.id, repoId);
        await refetchRepos();
        toast.success('Repository unlinked');
      } catch (err) {
        console.error('Failed to remove repository:', err);
        toast.error('Failed to unlink repository');
      } finally {
        setIsDeletingRepo(null);
      }
    },
    [project?.id, refetchRepos]
  );

  // Filter issues for this project only (use resolved project's actual ID)
  const projectIssues = useMemo(() => {
    if (!project) return [];
    return issues.filter((issue) => issue.project_id === project.id);
  }, [issues, project]);

  // Apply filters to project issues
  const filteredIssues = useMemo(() => {
    let result = projectIssues;

    // Priority filter
    if (filters.priority?.length) {
      result = result.filter((i) =>
        filters.priority!.includes(i.priority ?? 0)
      );
    }

    // Assignee filter
    if (filters.assigneeId?.length) {
      result = result.filter(
        (i) => i.assignee_id && filters.assigneeId!.includes(i.assignee_id)
      );
    }

    return result;
  }, [projectIssues, filters]);

  // Sort issues based on display options
  const sortIssues = useCallback(
    (issuesToSort: TaskWithAttemptStatus[]) => {
      const sorted = [...issuesToSort];
      const multiplier = displayOptions.sortDirection === 'desc' ? -1 : 1;

      sorted.sort((a, b) => {
        switch (displayOptions.sortBy) {
          case 'priority':
            return ((a.priority ?? 5) - (b.priority ?? 5)) * multiplier;
          case 'updated':
            return (
              (new Date(a.updated_at || a.created_at).getTime() -
                new Date(b.updated_at || b.created_at).getTime()) *
              multiplier
            );
          case 'created':
          default:
            return (
              (new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()) *
              multiplier
            );
        }
      });

      return sorted;
    },
    [displayOptions.sortBy, displayOptions.sortDirection]
  );

  // Group issues based on display options
  const groupedIssues = useMemo(() => {
    const groupBy = displayOptions.groupBy;

    if (groupBy === 'none') {
      return { all: sortIssues(filteredIssues) };
    }

    if (groupBy === 'status') {
      const grouped: Record<TaskStatus, TaskWithAttemptStatus[]> = {
        todo: [],
        inprogress: [],
        inreview: [],
        done: [],
        cancelled: [],
      };
      filteredIssues.forEach((issue) => {
        grouped[issue.status]?.push(issue);
      });
      Object.keys(grouped).forEach((key) => {
        grouped[key as TaskStatus] = sortIssues(grouped[key as TaskStatus]);
      });
      return grouped;
    }

    if (groupBy === 'priority') {
      const grouped: Record<string, TaskWithAttemptStatus[]> = {
        '1': [], // Urgent
        '2': [], // High
        '3': [], // Medium
        '4': [], // Low
        '0': [], // No priority
      };
      filteredIssues.forEach((issue) => {
        const key = String(issue.priority ?? 0);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(issue);
      });
      Object.keys(grouped).forEach((key) => {
        grouped[key] = sortIssues(grouped[key]);
      });
      return grouped;
    }

    if (groupBy === 'assignee') {
      const grouped: Record<string, TaskWithAttemptStatus[]> = {
        unassigned: [],
      };
      filteredIssues.forEach((issue) => {
        const key = issue.assignee_id || 'unassigned';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(issue);
      });
      Object.keys(grouped).forEach((key) => {
        grouped[key] = sortIssues(grouped[key]);
      });
      return grouped;
    }

    return { all: sortIssues(filteredIssues) };
  }, [filteredIssues, displayOptions.groupBy, sortIssues]);

  // For backwards compatibility, keep issuesByStatus for status grouping
  const issuesByStatus = useMemo(() => {
    if (displayOptions.groupBy === 'status') {
      return groupedIssues as Record<TaskStatus, TaskWithAttemptStatus[]>;
    }
    // Fallback to status grouping
    const grouped: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };
    filteredIssues.forEach((issue) => {
      grouped[issue.status]?.push(issue);
    });
    return grouped;
  }, [filteredIssues, displayOptions.groupBy, groupedIssues]);

  // Calculate progress stats
  const stats = useMemo(() => {
    const total = projectIssues.length;
    const done = projectIssues.filter((i) => i.status === 'done').length;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percentage };
  }, [projectIssues]);

  // Calculate issue count per assignee
  const issueCountPerAssignee = useMemo(() => {
    const counts: Record<string | 'unassigned', number> = { unassigned: 0 };

    projectIssues.forEach((issue) => {
      if (issue.assignee_id) {
        counts[issue.assignee_id] = (counts[issue.assignee_id] || 0) + 1;
      } else {
        counts.unassigned++;
      }
    });

    return counts;
  }, [projectIssues]);

  const handleCreateIssue = async () => {
    try {
      await IssueFormDialog.show({ teamId, projectId });
    } catch {
      // User cancelled
    }
  };

  const handleIssueClick = (issue: TaskWithAttemptStatus) => {
    // Navigate to issue detail (or open dialog)
    navigate(`/projects/${projectId}/tasks/${issue.id}`);
  };

  const handleAssigneeChange = useCallback(
    async (issueId: string, assigneeId: string | null) => {
      try {
        await tasksApi.update(issueId, {
          title: null,
          description: null,
          status: null,
          parent_workspace_id: null,
          image_ids: null,
          priority: null,
          due_date: null,
          assignee_id: assigneeId,
        });
        await refreshIssues();
      } catch (err) {
        console.error('Failed to update assignee:', err);
      }
    },
    [refreshIssues]
  );

  const isLoading = projectsLoading || issuesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Project not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{team?.icon || '👥'}</span>
          <span
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => navigate(`/teams/${teamId}/projects`)}
          >
            {team?.name}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-lg">{project.icon || '📁'}</span>
          <span className="font-semibold">{project.name}</span>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            <TabsTrigger value="overview" className="text-xs px-3 h-7">
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="text-xs px-3 h-7">
              Insights
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left side - Content based on tab */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          {activeTab === 'insights' ? (
            <ProjectInsightsPanel
              project={project}
              issues={projectIssues}
              teamIdentifier={team?.identifier || undefined}
            />
          ) : (
            <>
              {/* Filter bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <IssueFilterDropdown
                  filters={filters}
                  onFiltersChange={setFilters}
                  teamMembers={MOCK_TEAM_MEMBERS}
                  projects={[]}
                  issues={projectIssues}
                />
                <DisplayOptionsDropdown
                  options={displayOptions}
                  onOptionsChange={setDisplayOptions}
                />
              </div>

              {/* Issues grouped based on display options */}
              <div className="flex-1 overflow-y-auto">
                {displayOptions.groupBy === 'status' ? (
                  // Status grouping
                  STATUS_ORDER.map((status) => (
                    <StatusGroup
                      key={status}
                      status={status}
                      issues={issuesByStatus[status]}
                      teamIdentifier={team?.identifier || undefined}
                      teamMembers={MOCK_TEAM_MEMBERS}
                      issueCountPerAssignee={issueCountPerAssignee}
                      onIssueClick={handleIssueClick}
                      onAddIssue={() => handleCreateIssue()}
                      onAssigneeChange={handleAssigneeChange}
                    />
                  ))
                ) : displayOptions.groupBy === 'priority' ? (
                  // Priority grouping
                  ['1', '2', '3', '4', '0'].map((priorityKey) => {
                    const priorityIssues =
                      (
                        groupedIssues as Record<string, TaskWithAttemptStatus[]>
                      )[priorityKey] || [];
                    if (priorityIssues.length === 0) return null;
                    const priorityInfo = PRIORITY_DISPLAY.find(
                      (p) => p.value === Number(priorityKey)
                    );
                    return (
                      <GenericGroup
                        key={priorityKey}
                        title={priorityInfo?.label || 'Unknown'}
                        issues={priorityIssues}
                        teamIdentifier={team?.identifier || undefined}
                        teamMembers={MOCK_TEAM_MEMBERS}
                        issueCountPerAssignee={issueCountPerAssignee}
                        onIssueClick={handleIssueClick}
                        onAddIssue={() => handleCreateIssue()}
                        onAssigneeChange={handleAssigneeChange}
                      />
                    );
                  })
                ) : displayOptions.groupBy === 'assignee' ? (
                  // Assignee grouping
                  Object.entries(groupedIssues).map(
                    ([assigneeKey, assigneeIssues]) => {
                      if (
                        (assigneeIssues as TaskWithAttemptStatus[]).length === 0
                      )
                        return null;
                      const member = MOCK_TEAM_MEMBERS.find(
                        (m) => m.id === assigneeKey
                      );
                      const title =
                        assigneeKey === 'unassigned'
                          ? 'Unassigned'
                          : member?.name || assigneeKey;
                      return (
                        <GenericGroup
                          key={assigneeKey}
                          title={title}
                          issues={assigneeIssues as TaskWithAttemptStatus[]}
                          teamIdentifier={team?.identifier || undefined}
                          teamMembers={MOCK_TEAM_MEMBERS}
                          issueCountPerAssignee={issueCountPerAssignee}
                          onIssueClick={handleIssueClick}
                          onAddIssue={() => handleCreateIssue()}
                          onAssigneeChange={handleAssigneeChange}
                        />
                      );
                    }
                  )
                ) : (
                  // No grouping - flat list
                  <div className="border-b border-border/50">
                    {(
                      groupedIssues as { all: TaskWithAttemptStatus[] }
                    ).all?.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        teamIdentifier={team?.identifier || undefined}
                        teamMembers={MOCK_TEAM_MEMBERS}
                        issueCountPerAssignee={issueCountPerAssignee}
                        onClick={() => handleIssueClick(issue)}
                        onAssigneeChange={handleAssigneeChange}
                      />
                    ))}
                  </div>
                )}

                {filteredIssues.length === 0 && projectIssues.length > 0 && (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                      <AlertCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">
                      No matching issues
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try adjusting your filters
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFilters({
                          priority: null,
                          assigneeId: null,
                          projectId: null,
                        })
                      }
                    >
                      Clear filters
                    </Button>
                  </div>
                )}

                {projectIssues.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">No issues yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first issue for this project
                    </p>
                    <Button onClick={() => handleCreateIssue()}>
                      <Plus className="h-4 w-4 mr-1" />
                      New issue
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right sidebar - Project details */}
        <div className="w-80 flex-shrink-0 overflow-y-auto bg-muted/10">
          <div className="p-4 space-y-4">
            {/* Priority */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Priority</span>
              <span className="text-sm">
                {project.priority
                  ? PRIORITY_DISPLAY.find((p) => p.value === project.priority)
                      ?.label
                  : 'No priority'}
              </span>
            </div>

            {/* Lead */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Lead</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
              >
                <User className="h-3.5 w-3.5 mr-1" />
                Add lead
              </Button>
            </div>

            {/* Members */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Members</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
              >
                <Users className="h-3.5 w-3.5 mr-1" />
                Add members
              </Button>
            </div>

            {/* Dates */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Dates</span>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatDate(project.start_date) || 'Start'}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span>{formatDate(project.target_date) || 'Target'}</span>
              </div>
            </div>

            {/* Teams */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Teams</span>
              <Badge variant="secondary" className="text-xs">
                {team?.icon} {team?.name}
              </Badge>
            </div>

            {/* Labels */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Labels</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
              >
                <Tag className="h-3.5 w-3.5 mr-1" />
                Add label
              </Button>
            </div>

            {/* Repositories */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  Repositories
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleOpenRepoDialog}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {projectRepos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Link a repository to enable AI agent execution from task
                  comments.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {projectRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {repo.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {repo.path}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemoveRepo(repo.id)}
                        disabled={isDeletingRepo === repo.id}
                      >
                        {isDeletingRepo === repo.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Milestones</span>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add milestones to organize work within your project and break it
                into more granular stages.
              </p>
            </div>

            {/* Progress */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Progress</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-8 mb-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-sm" />
                    Scope
                  </div>
                  <div className="text-lg font-semibold">{stats.total}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-sm" />
                    Completed
                  </div>
                  <div className="text-lg font-semibold">
                    {stats.done}
                    <span className="text-sm text-muted-foreground ml-1">
                      • {stats.percentage}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Assignees breakdown */}
            <div className="border-t pt-4">
              <Tabs defaultValue="assignees" className="w-full">
                <TabsList className="w-full h-8">
                  <TabsTrigger value="assignees" className="flex-1 text-xs h-7">
                    Assignees
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="flex-1 text-xs h-7">
                    Labels
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="mt-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      No assignee
                    </span>
                  </div>
                  <span className="text-sm">
                    {projectIssues.filter((i) => !i.assignee_id).length}
                  </span>
                </div>
              </div>
            </div>

            {/* Activity Section */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setActivityExpanded(!activityExpanded)}
                  className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
                >
                  Activity
                  {activityExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <button className="text-xs text-muted-foreground hover:text-foreground">
                  See all
                </button>
              </div>

              {activityExpanded && (
                <div className="space-y-3">
                  {/* Project creation activity */}
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <GitCommit className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">rupesh panwar</span>
                        <span className="text-muted-foreground">
                          {' '}
                          created the project
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project?.created_at
                          ? formatDate(project.created_at.toString())
                          : 'Unknown date'}
                      </p>
                    </div>
                  </div>

                  {/* Recent issue activities */}
                  {projectIssues.slice(0, 3).map((issue) => (
                    <div key={issue.id} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center mt-0.5">
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          <span className="text-muted-foreground">Issue </span>
                          <span className="font-medium">{issue.title}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            created
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(issue.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {projectIssues.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No recent activity
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
