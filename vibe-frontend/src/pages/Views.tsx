import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { Loader } from '@/components/ui/loader';
import { IssueDetailPanel } from '@/components/tasks/IssueDetailPanel';
import {
  loadIssuePanelSize,
  saveIssuePanelSize,
  PANEL_DEFAULTS,
} from '@/lib/panelStorage';
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

  // Display mode state with localStorage persistence
  const [displayMode, setDisplayMode] = useState<DisplayMode>(loadDisplayMode);
  const [activeTab, setActiveTab] = useState<'issues' | 'projects'>('issues');

  // Issue detail panel state
  const [selectedIssue, setSelectedIssue] =
    useState<TaskWithAttemptStatus | null>(null);
  const [issuePanelSize, setIssuePanelSize] =
    useState<number>(loadIssuePanelSize);

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    saveDisplayMode(mode);
  }, []);

  // Handle issue click - open detail panel
  const handleIssueClick = useCallback((issue: TaskWithAttemptStatus) => {
    setSelectedIssue(issue);
  }, []);

  // Handle panel resize
  const handlePanelResize = useCallback((sizes: number[]) => {
    if (
      sizes.length === 2 &&
      sizes[1] >= PANEL_DEFAULTS.ISSUE_PANEL_MIN &&
      sizes[1] <= PANEL_DEFAULTS.ISSUE_PANEL_MAX
    ) {
      setIssuePanelSize(sizes[1]);
      saveIssuePanelSize(sizes[1]);
    }
  }, []);

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
                selectedIssueId={selectedIssue?.id}
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
                selectedIssueId={selectedIssue?.id}
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

      {/* Content area with resizable panel */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full"
          onLayout={handlePanelResize}
        >
          {/* Main content area */}
          <ResizablePanel
            defaultSize={selectedIssue ? 100 - issuePanelSize : 100}
            minSize={40}
            className="min-w-0"
          >
            {issueContent}
          </ResizablePanel>

          {/* Issue Detail Panel with resize handle */}
          {selectedIssue && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                defaultSize={issuePanelSize}
                minSize={25}
                maxSize={60}
                className="min-w-0"
              >
                <IssueDetailPanel
                  issue={selectedIssue}
                  teamId={activeTeamId}
                  issueKey={selectedIssueKey}
                  onClose={() => setSelectedIssue(null)}
                  onUpdate={refresh}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
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
