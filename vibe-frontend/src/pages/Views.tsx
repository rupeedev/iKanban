import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Loader } from '@/components/ui/loader';
import { IssueFullView } from '@/components/tasks/IssueFullView';
import {
  DisplayMode,
  loadDisplayMode,
  saveDisplayMode,
  STATUS_ORDER,
  StatusGroup,
  BoardColumn,
  ViewsHeader,
} from './views-components';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors';

function AllIssuesView() {
  // Get teamId from URL params (for /teams/:teamId/views route)
  const { teamId: teamIdFromParams } = useParams<{ teamId: string }>();
  const { teams, teamsById } = useTeams();
  const { projects } = useProjects();

  // Use teamId from URL params, or fall back to first team for /views route
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const activeTeamId = teamIdFromParams || teamIds[0];

  // Fetch issues for the active team
  const { issues, isLoading, refresh } = useTeamIssues(activeTeamId);

  // Fetch team members for the active team
  const { members: activeTeamMembers } = useTeamMembers(activeTeamId);

  // Display mode state with localStorage persistence
  const [displayMode, setDisplayMode] = useState<DisplayMode>(loadDisplayMode);
  const [activeTab, setActiveTab] = useState<'issues' | 'projects'>('issues');

  // Issue full-view state
  const [selectedIssue, setSelectedIssue] =
    useState<TaskWithAttemptStatus | null>(null);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    saveDisplayMode(mode);
  }, []);

  // Handle issue click - open full-view
  const handleIssueClick = useCallback((issue: TaskWithAttemptStatus) => {
    setSelectedIssue(issue);
  }, []);

  // Get current index of selected issue for navigation
  const selectedIssueIndex = useMemo(() => {
    if (!selectedIssue) return -1;
    return issues.findIndex((i) => i.id === selectedIssue.id);
  }, [selectedIssue, issues]);

  // Navigation handlers for full-view
  const handleNavigatePrev = useCallback(() => {
    if (selectedIssueIndex > 0) {
      setSelectedIssue(issues[selectedIssueIndex - 1]);
    }
  }, [selectedIssueIndex, issues]);

  const handleNavigateNext = useCallback(() => {
    if (selectedIssueIndex < issues.length - 1) {
      setSelectedIssue(issues[selectedIssueIndex + 1]);
    }
  }, [selectedIssueIndex, issues]);

  // Transform team members to IssueFullView format
  const teamMembers: TeamMember[] = useMemo(() => {
    return activeTeamMembers.map((m) => ({
      id: m.id,
      name: m.display_name || m.email?.split('@')[0] || 'Unknown',
      email: m.email,
      avatar: m.avatar_url || undefined,
    }));
  }, [activeTeamMembers]);

  // Get projects for dropdown - return all user's projects
  const teamProjects = useMemo(() => {
    return projects.map((p) => ({ id: p.id, name: p.name }));
  }, [projects]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIssue) {
        setSelectedIssue(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssue]);

  // Generate issue key for selected issue
  const selectedIssueKey = useMemo(() => {
    if (!selectedIssue || !activeTeamId) return undefined;
    const team = teamsById[activeTeamId];
    if (!team || selectedIssue.issue_number == null) return undefined;
    const prefix = team.identifier || team.name.slice(0, 3).toUpperCase();
    return `${prefix}-${selectedIssue.issue_number}`;
  }, [selectedIssue, activeTeamId, teamsById]);

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

  // Full-view mode: show issue detail as full page when selected
  if (selectedIssue) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <IssueFullView
          issue={selectedIssue}
          teamId={activeTeamId}
          issueKey={selectedIssueKey}
          teamMembers={teamMembers}
          teamProjects={teamProjects}
          onClose={() => setSelectedIssue(null)}
          onUpdate={refresh}
          onNavigatePrev={handleNavigatePrev}
          onNavigateNext={handleNavigateNext}
          currentIndex={selectedIssueIndex}
          totalCount={issues.length}
        />
      </div>
    );
  }

  const issueContent =
    displayMode === 'list' ? (
      /* List View */
      <div className="h-full overflow-auto">
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
                selectedIssueId={undefined}
                onIssueClick={handleIssueClick}
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
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="flex h-full">
          {STATUS_ORDER.map((status) => {
            const statusIssues = groupedIssues[status] || [];
            return (
              <BoardColumn
                key={status}
                status={status}
                issues={statusIssues}
                projectNamesById={projectNamesById}
                selectedIssueId={undefined}
                onIssueClick={handleIssueClick}
              />
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header with tabs and display toggle */}
      <ViewsHeader
        activeTab={activeTab}
        displayMode={displayMode}
        onTabChange={setActiveTab}
        onDisplayModeChange={handleDisplayModeChange}
      />

      {/* Content - issue list or board */}
      <div className="flex-1 min-h-0">{issueContent}</div>
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
