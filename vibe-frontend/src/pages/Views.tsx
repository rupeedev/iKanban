import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  PlayCircle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Calendar,
  Plus,
  List,
  LayoutGrid,
  SlidersHorizontal,
  Filter,
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus } from 'shared/types';

// Display mode type
type DisplayMode = 'list' | 'board';

// localStorage key for display mode persistence
const DISPLAY_MODE_STORAGE_KEY = 'ikanban-views-display-mode';

function loadDisplayMode(): DisplayMode {
  try {
    const stored = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (stored === 'list' || stored === 'board') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'list'; // Default to list view
}

function saveDisplayMode(mode: DisplayMode): void {
  try {
    localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage not available
  }
}

// Status configuration
const STATUS_CONFIG: Record<
  string,
  { icon: typeof Circle; label: string; color: string }
> = {
  todo: { icon: Circle, label: 'Backlog', color: 'text-muted-foreground' },
  inprogress: {
    icon: PlayCircle,
    label: 'In Progress',
    color: 'text-yellow-500',
  },
  inreview: { icon: CircleDot, label: 'In Review', color: 'text-green-500' },
  done: { icon: CheckCircle2, label: 'Done', color: 'text-blue-500' },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    color: 'text-muted-foreground',
  },
};

// Order of status groups to display
const STATUS_ORDER = ['inreview', 'inprogress', 'todo', 'done', 'cancelled'];

interface DisplayModeToggleProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

function DisplayModeToggle({ mode, onModeChange }: DisplayModeToggleProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 bg-background border-border text-foreground p-2"
      >
        <div className="flex gap-1 p-1 bg-muted/50 rounded-md">
          <button
            onClick={() => onModeChange('list')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors',
              mode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="h-4 w-4" />
            List
          </button>
          <button
            onClick={() => onModeChange('board')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors',
              mode === 'board'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface IssueRowProps {
  issue: TaskWithAttemptStatus;
  projectName?: string;
}

function IssueRow({ issue, projectName }: IssueRowProps) {
  const navigate = useNavigate();
  const status = issue.status?.toLowerCase() || 'todo';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get short identifier from issue
  const shortId =
    (issue as { identifier?: string }).identifier || issue.id.slice(0, 8);

  return (
    <div
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-b-0"
      onClick={() =>
        navigate(`/projects/${issue.project_id}/tasks/${issue.id}`)
      }
    >
      {/* Priority indicator */}
      <div className="w-4 text-muted-foreground">
        <MoreHorizontal className="w-4 h-4 opacity-0 group-hover:opacity-100" />
      </div>

      {/* Issue ID */}
      <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
        {shortId}
      </span>

      {/* Status icon */}
      <StatusIcon className={cn('w-4 h-4 shrink-0', statusConfig.color)} />

      {/* Title */}
      <span className="flex-1 truncate text-sm">{issue.title}</span>

      {/* Project tag */}
      {projectName && (
        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0 max-w-[200px] truncate">
          {projectName}
        </span>
      )}

      {/* Assignee avatar placeholder */}
      <div className="w-6 h-6 rounded-full bg-muted shrink-0" />

      {/* Due date */}
      {issue.due_date && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Calendar className="w-3 h-3" />
          {formatDate(issue.due_date)}
        </span>
      )}
    </div>
  );
}

interface StatusGroupProps {
  status: string;
  issues: TaskWithAttemptStatus[];
  projectNamesById: Record<string, string>;
  defaultExpanded?: boolean;
}

function StatusGroup({
  status,
  issues,
  projectNamesById,
  defaultExpanded = true,
}: StatusGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        className="group flex items-center gap-2 px-4 py-2 w-full hover:bg-muted/50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <StatusIcon className={cn('w-4 h-4', statusConfig.color)} />
        <span className="font-medium text-sm">{statusConfig.label}</span>
        <span className="text-sm text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>

      {/* Issues */}
      {expanded && (
        <div className="ml-2">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              projectName={projectNamesById[issue.project_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BoardColumnProps {
  status: string;
  issues: TaskWithAttemptStatus[];
  projectNamesById: Record<string, string>;
}

function BoardColumn({ status, issues, projectNamesById }: BoardColumnProps) {
  const navigate = useNavigate();
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex flex-col min-w-[300px] max-w-[300px] h-full border-r border-border last:border-r-0">
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-muted/30">
        <StatusIcon className={cn('w-4 h-4', statusConfig.color)} />
        <span className="font-medium text-sm">{statusConfig.label}</span>
        <span className="text-sm text-muted-foreground">{issues.length}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {issues.map((issue) => {
            const shortId =
              (issue as { identifier?: string }).identifier ||
              issue.id.slice(0, 8);
            const projectName = projectNamesById[issue.project_id];

            return (
              <div
                key={issue.id}
                className="group bg-background border border-border rounded-lg p-3 hover:border-border/80 cursor-pointer shadow-sm"
                onClick={() =>
                  navigate(`/projects/${issue.project_id}/tasks/${issue.id}`)
                }
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {shortId}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                </div>

                {/* Status + Title */}
                <div className="flex items-start gap-2 mb-2">
                  <StatusIcon
                    className={cn('w-4 h-4 mt-0.5 shrink-0', statusConfig.color)}
                  />
                  <span className="text-sm font-medium line-clamp-2">
                    {issue.title}
                  </span>
                </div>

                {/* Priority indicator */}
                <div className="flex items-center gap-2 mb-2">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* Project tag */}
                {projectName && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Circle className="w-3 h-3" />
                    <span className="truncate">{projectName}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ViewsHeaderProps {
  activeTab: 'issues' | 'projects';
  displayMode: DisplayMode;
  onTabChange: (tab: 'issues' | 'projects') => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
}

function ViewsHeader({
  activeTab,
  displayMode,
  onTabChange,
  onDisplayModeChange,
}: ViewsHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border px-4 py-2 flex items-center gap-2">
      {/* Left side: Issues/Projects tabs and Filter */}
      <div className="flex items-center gap-1">
        <Button
          variant={activeTab === 'issues' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-sm"
          onClick={() => onTabChange('issues')}
        >
          Issues
        </Button>
        <Button
          variant={activeTab === 'projects' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-sm"
          onClick={() => onTabChange('projects')}
        >
          Projects
        </Button>
        <div className="w-px h-5 bg-border mx-2" />
        <Button variant="ghost" size="sm" className="text-sm gap-1.5">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      <div className="flex-1" />

      {/* Right side: Display toggle */}
      <DisplayModeToggle mode={displayMode} onModeChange={onDisplayModeChange} />
    </div>
  );
}

function AllIssuesView() {
  // Get teamId from URL params (for /teams/:teamId/views route)
  const { teamId: teamIdFromParams } = useParams<{ teamId: string }>();
  const { teams } = useTeams();
  const { projects } = useProjects();

  // Use teamId from URL params, or fall back to first team for /views route
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const activeTeamId = teamIdFromParams || teamIds[0];

  // Fetch issues for the active team
  const { issues, isLoading } = useTeamIssues(activeTeamId);

  // Display mode state with localStorage persistence
  const [displayMode, setDisplayMode] = useState<DisplayMode>(loadDisplayMode);
  const [activeTab, setActiveTab] = useState<'issues' | 'projects'>('issues');

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    saveDisplayMode(mode);
  }, []);

  // Project names lookup
  const projectNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  // Group issues by status
  const groupedIssues = useMemo(() => {
    const groups: Record<string, TaskWithAttemptStatus[]> = {
      inprogress: [],
      todo: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      const status = issue.status?.toLowerCase() || 'todo';
      if (groups[status]) {
        groups[status].push(issue);
      } else {
        groups.todo.push(issue);
      }
    });

    return groups;
  }, [issues]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader message="Loading issues..." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header with tabs and display toggle */}
      <ViewsHeader
        activeTab={activeTab}
        displayMode={displayMode}
        onTabChange={setActiveTab}
        onDisplayModeChange={handleDisplayModeChange}
      />

      {/* Content area */}
      {displayMode === 'list' ? (
        /* List View */
        <div className="flex-1 overflow-auto">
          <div className="py-2">
            {STATUS_ORDER.map((status) => {
              const statusIssues = groupedIssues[status] || [];
              if (statusIssues.length === 0) return null;
              return (
                <StatusGroup
                  key={status}
                  status={status}
                  issues={statusIssues}
                  projectNamesById={projectNamesById}
                />
              );
            })}

            {/* Empty state if no issues */}
            {issues.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No issues found</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Board View - horizontal scrollable */
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full">
            {STATUS_ORDER.map((status) => {
              const statusIssues = groupedIssues[status] || [];
              return (
                <BoardColumn
                  key={status}
                  status={status}
                  issues={statusIssues}
                  projectNamesById={projectNamesById}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Views() {
  return (
    <div className="h-full flex flex-col">
      <AllIssuesView />
    </div>
  );
}
