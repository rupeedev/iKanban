import { useCallback, useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { openIssueForm } from '@/lib/openIssueForm';

import { useTeamDashboard } from '@/hooks/useTeamDashboard';
import { useIssueUpdateHandlers } from '@/hooks/useIssueUpdateHandlers';
import { useTags } from '@/hooks/useTags';
import { useBulkTaskTags } from '@/hooks/useBulkTaskTags';

import { TeamIssuesContent } from '@/components/tasks/TeamIssuesContent';
import {
  TeamIssuesHeader,
  ViewFilter,
  DisplayMode,
} from '@/components/tasks/TeamIssuesHeader';
import { IssueFullView } from '@/components/tasks/IssueFullView';
import { FilterState } from '@/components/filters/IssueFilterDropdown';
import type { DragEndEvent } from '@dnd-kit/core';

// localStorage key for display mode persistence
const DISPLAY_MODE_STORAGE_KEY = 'ikanban-issues-display-mode';

function loadDisplayMode(): DisplayMode {
  try {
    const stored = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (stored === 'list' || stored === 'board') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'board'; // Default to board view
}

function saveDisplayMode(mode: DisplayMode): void {
  try {
    localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage not available
  }
}

import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors';

const TASK_STATUSES = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
] as const;

const normalizeStatus = (status: string): TaskStatus =>
  status.toLowerCase() as TaskStatus;

export function TeamIssues() {
  const { t } = useTranslation(['tasks', 'common']);
  const { teamId } = useParams<{ teamId: string }>();

  // Single aggregated API call - replaces 5+ separate hooks to prevent 429 rate limiting
  const {
    team,
    members,
    projects,
    issues,
    issuesById,
    isLoading,
    isFetching,
    error,
    refresh,
  } = useTeamDashboard(teamId);

  const [showInsights, setShowInsights] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(loadDisplayMode);

  // Handle display mode change with localStorage persistence
  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    saveDisplayMode(mode);
  }, []);

  // Filter state
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [filters, setFilters] = useState<FilterState>({
    priority: null,
    assigneeId: null,
    projectId: null,
    tags: null,
  });

  // Use actual team ID for API calls
  const actualTeamId = team?.id;

  // Fetch tags for the team
  const { tags: teamTags } = useTags(actualTeamId);

  // Fetch tags for all issues (for filtering)
  const issueIds = useMemo(() => issues.map((i) => i.id), [issues]);
  const { tagsMap: issueTagsDetailMap } = useBulkTaskTags(issueIds);

  // Convert tagsMap (taskId -> TaskTagWithDetails[]) to (taskId -> tagId[])
  const issueTagsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    issueTagsDetailMap.forEach((tags, taskId) => {
      map.set(
        taskId,
        tags.map((t) => t.tag_id)
      );
    });
    return map;
  }, [issueTagsDetailMap]);

  // Transform team members to AssigneeSelector format
  const teamMembers: TeamMember[] = useMemo(() => {
    return members.map((m) => ({
      id: m.id,
      name: m.display_name || m.email?.split('@')[0] || 'Unknown',
      email: m.email,
      avatar: m.avatar_url || undefined,
    }));
  }, [members]);

  // Team projects are already filtered by the backend - use directly
  const teamProjects = projects;

  // Issue update handlers (assignee, priority, project, status)
  const {
    handleAssigneeChange,
    handlePriorityChange,
    handleProjectChange,
    handleStatusChange,
  } = useIssueUpdateHandlers({
    teamId: actualTeamId ?? '',
    issuesById,
    refresh,
  });

  const handleCreateIssue = useCallback(() => {
    // Open Linear-style issue form dialog
    // If no team projects, user can select any project from the dialog
    openIssueForm({
      teamId: actualTeamId,
      projectId: teamProjects.length > 0 ? teamProjects[0].id : undefined,
    });
  }, [actualTeamId, teamProjects]);

  // Map project IDs to names for display
  const projectNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  // Apply filters to issues
  const filteredIssues = useMemo(() => {
    let result = issues;

    // Apply view filter (status-based)
    if (viewFilter === 'active') {
      result = result.filter((i) =>
        ['inprogress', 'inreview'].includes(i.status)
      );
    } else if (viewFilter === 'backlog') {
      result = result.filter((i) => i.status === 'todo');
    }

    // Apply priority filter
    if (filters.priority?.length) {
      result = result.filter((i) =>
        filters.priority!.includes(i.priority ?? 0)
      );
    }

    // Apply assignee filter
    if (filters.assigneeId?.length) {
      result = result.filter(
        (i) => i.assignee_id && filters.assigneeId!.includes(i.assignee_id)
      );
    }

    // Apply project filter
    if (filters.projectId) {
      result = result.filter((i) => i.project_id === filters.projectId);
    }

    // Apply tag filter (AND logic - issue must have ALL selected tags)
    if (filters.tags?.length) {
      result = result.filter((i) => {
        const issueTags = issueTagsMap.get(i.id) || [];
        return filters.tags!.every((tagId) => issueTags.includes(tagId));
      });
    }

    return result;
  }, [issues, viewFilter, filters, issueTagsMap]);

  const kanbanColumns = useMemo(() => {
    const columns: Record<
      TaskStatus,
      { task: TaskWithAttemptStatus; issueKey?: string; projectName?: string }[]
    > = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    filteredIssues.forEach((issue) => {
      const statusKey = normalizeStatus(issue.status);
      // Generate issue key from team identifier and issue_number
      let issueKey: string | undefined;
      if (team && issue.issue_number != null) {
        const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
        issueKey = `${prefix}-${issue.issue_number}`;
      }
      columns[statusKey].push({
        task: issue,
        issueKey,
        projectName: projectNamesById[issue.project_id],
      });
    });

    // Sort each column by issue_number ascending (lowest first)
    TASK_STATUSES.forEach((status) => {
      columns[status].sort((a, b) => {
        const aNum = a.task.issue_number ?? 0;
        const bNum = b.task.issue_number ?? 0;
        return aNum - bNum;
      });
    });

    return columns;
  }, [filteredIssues, team, projectNamesById]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const draggedIssueId = active.id as string;
      const newStatus = over.id as TaskStatus;
      await handleStatusChange(draggedIssueId, newStatus);
    },
    [handleStatusChange]
  );

  const handleViewIssueDetails = useCallback((issue: TaskWithAttemptStatus) => {
    // Open inline side panel instead of modal
    setSelectedIssueId(issue.id);
    // Close insights panel when opening issue detail
    setShowInsights(false);
  }, []);

  // Handler for clearing all filters
  const handleClearFilters = useCallback(() => {
    setViewFilter('all');
    setFilters({
      priority: null,
      assigneeId: null,
      projectId: null,
      tags: null,
    });
  }, []);

  // Get the selected issue from state
  const selectedIssue = selectedIssueId ? issuesById[selectedIssueId] : null;

  // Get current index of selected issue for navigation
  const selectedIssueIndex = useMemo(() => {
    if (!selectedIssueId) return -1;
    return filteredIssues.findIndex((i) => i.id === selectedIssueId);
  }, [selectedIssueId, filteredIssues]);

  // Navigation handlers for full-view
  const handleNavigatePrev = useCallback(() => {
    if (selectedIssueIndex > 0) {
      setSelectedIssueId(filteredIssues[selectedIssueIndex - 1].id);
    }
  }, [selectedIssueIndex, filteredIssues]);

  const handleNavigateNext = useCallback(() => {
    if (selectedIssueIndex < filteredIssues.length - 1) {
      setSelectedIssueId(filteredIssues[selectedIssueIndex + 1].id);
    }
  }, [selectedIssueIndex, filteredIssues]);

  // Generate issue key for selected issue
  const selectedIssueKey = useMemo(() => {
    if (!selectedIssue || !team || selectedIssue.issue_number == null)
      return undefined;
    const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
    return `${prefix}-${selectedIssue.issue_number}`;
  }, [selectedIssue, team]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIssueId) {
        setSelectedIssueId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssueId]);

  // Convert team projects to format expected by dropdown
  const teamProjectsForDropdown = useMemo(() => {
    return teamProjects.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }, [teamProjects]);

  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('common:states.error')}
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load team issues'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return <Loader message={t('loading')} size={32} className="py-8" />;
  }

  if (!team) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Team not found
          </AlertTitle>
          <AlertDescription>
            The team you're looking for doesn't exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasIssues = issues.length > 0;
  const hasFilteredIssues = filteredIssues.length > 0;
  const hasActiveFilters =
    viewFilter !== 'all' ||
    (filters.priority?.length ?? 0) > 0 ||
    (filters.assigneeId?.length ?? 0) > 0 ||
    !!filters.projectId ||
    (filters.tags?.length ?? 0) > 0;

  // Full-view mode: show issue detail as full page when selected
  if (selectedIssue) {
    return (
      <div className="h-full flex flex-col">
        <IssueFullView
          issue={selectedIssue}
          teamId={actualTeamId}
          issueKey={selectedIssueKey}
          teamMembers={teamMembers}
          teamProjects={teamProjectsForDropdown}
          onClose={() => setSelectedIssueId(null)}
          onUpdate={refresh}
          onNavigatePrev={handleNavigatePrev}
          onNavigateNext={handleNavigateNext}
          currentIndex={selectedIssueIndex}
          totalCount={filteredIssues.length}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TeamIssuesHeader
        team={team}
        viewFilter={viewFilter}
        filters={filters}
        showInsights={showInsights}
        displayMode={displayMode}
        teamMembers={teamMembers}
        teamProjects={teamProjectsForDropdown}
        tags={teamTags}
        issues={issues}
        issueTagsMap={issueTagsMap}
        isFetching={isFetching}
        onViewFilterChange={setViewFilter}
        onFiltersChange={setFilters}
        onToggleInsights={() => setShowInsights(!showInsights)}
        onDisplayModeChange={handleDisplayModeChange}
        onCreateIssue={handleCreateIssue}
        onRefresh={refresh}
      />

      {/* Content */}
      <div className="flex-1 min-h-0">
        <TeamIssuesContent
          hasIssues={hasIssues}
          hasFilteredIssues={hasFilteredIssues}
          hasActiveFilters={hasActiveFilters}
          showInsights={showInsights}
          displayMode={displayMode}
          selectedIssueId={selectedIssueId ?? undefined}
          issues={issues}
          kanbanColumns={kanbanColumns}
          teamMembers={teamMembers}
          teamProjects={teamProjectsForDropdown}
          onCreateIssue={handleCreateIssue}
          onDragEnd={handleDragEnd}
          onViewIssueDetails={handleViewIssueDetails}
          onAssigneeChange={handleAssigneeChange}
          onPriorityChange={handlePriorityChange}
          onProjectChange={handleProjectChange}
          onClearFilters={handleClearFilters}
          onCloseInsights={() => setShowInsights(false)}
        />
      </div>
    </div>
  );
}
