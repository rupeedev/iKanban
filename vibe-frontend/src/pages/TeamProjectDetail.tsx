import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { Loader2, AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';
import { useTeamIssues } from '@/hooks/useTeamIssues';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useProjectTaskTags } from '@/hooks/useProjectTaskTags';
import { ProjectInsightsPanel } from '@/components/projects/ProjectInsightsPanel';
import { TimelineView } from '@/components/projects/TimelineView';
import { EpicStoryDashboard } from '@/components/projects/EpicStoryDashboard';
import { IssueFormDialog } from '@/components/dialogs/issues/IssueFormDialog';
import {
  IssueFilterDropdown,
  type FilterState,
} from '@/components/filters/IssueFilterDropdown';
import type { TaskWithAttemptStatus } from 'shared/types';

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

  const { issues, isLoading: issuesLoading } = useTeamIssues(actualTeamId);
  const { members } = useTeamMembers(actualTeamId);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Transform members to the format expected by TimelineView
  const teamMembersForTimeline = useMemo(() => {
    return members.map((m) => ({
      id: m.id,
      name: m.display_name || m.email || 'Unknown',
      avatar: m.avatar_url || undefined,
    }));
  }, [members]);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    priority: null,
    assigneeId: null,
    projectId: null,
  });

  // Filter issues for this project only
  const projectIssues = useMemo(() => {
    if (!project) return [];
    return issues.filter((issue) => issue.project_id === project.id);
  }, [issues, project]);

  // Apply filters to project issues
  const filteredIssues = useMemo(() => {
    let result = projectIssues;

    if (filters.priority?.length) {
      result = result.filter((i) =>
        filters.priority!.includes(i.priority ?? 0)
      );
    }

    if (filters.assigneeId?.length) {
      result = result.filter(
        (i) => i.assignee_id && filters.assigneeId!.includes(i.assignee_id)
      );
    }

    return result;
  }, [projectIssues, filters]);

  // Fetch tags for all tasks in the project
  const { taskTagsMap, isLoading: tagsLoading } =
    useProjectTaskTags(filteredIssues);

  const handleCreateIssue = async () => {
    try {
      await IssueFormDialog.show({ teamId, projectId });
    } catch {
      // User cancelled
    }
  };

  const handleTaskClick = (task: TaskWithAttemptStatus) => {
    navigate(`/projects/${projectId}/tasks/${task.id}`);
  };

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
            <TabsTrigger value="dashboard" className="text-xs px-3 h-7">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs px-3 h-7">
              Timeline
            </TabsTrigger>
            <TabsTrigger value="insights" className="text-xs px-3 h-7">
              Insights
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'dashboard' ? (
          <div className="flex-1 overflow-auto">
            <EpicStoryDashboard
              tasks={projectIssues}
              teamIdentifier={team?.identifier || undefined}
              projectId={project.id}
              onTaskClick={handleTaskClick}
            />
          </div>
        ) : activeTab === 'insights' ? (
          <ProjectInsightsPanel
            project={project}
            issues={projectIssues}
            teamIdentifier={team?.identifier || undefined}
          />
        ) : (
          <>
            {/* Filter bar - simplified, no Display dropdown */}
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <IssueFilterDropdown
                filters={filters}
                onFiltersChange={setFilters}
                teamMembers={[]}
                projects={[]}
                issues={projectIssues}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateIssue}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                New Issue
              </Button>
            </div>

            {/* Timeline View */}
            <div className="flex-1 overflow-hidden">
              <TimelineView
                tasks={filteredIssues}
                taskTagsMap={taskTagsMap}
                teamIdentifier={team?.identifier || undefined}
                teamMembers={teamMembersForTimeline}
                onTaskClick={handleTaskClick}
                isLoadingTags={tagsLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
