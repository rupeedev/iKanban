import { Button } from '@/components/ui/button';
import {
  Plus,
  RefreshCw,
  CircleDot,
  PlayCircle,
  Circle,
  BarChart3,
} from 'lucide-react';
import {
  IssueFilterDropdown,
  FilterState,
} from '@/components/filters/IssueFilterDropdown';
import {
  DisplayModeToggle,
  type DisplayMode,
} from '@/components/filters/DisplayModeToggle';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { TeamMember } from '@/components/selectors';

type ViewFilter = 'all' | 'active' | 'backlog';

interface TeamProject {
  id: string;
  name: string;
}

interface TeamIssuesHeaderProps {
  team: { icon?: string | null; name: string };
  viewFilter: ViewFilter;
  filters: FilterState;
  showInsights: boolean;
  displayMode: DisplayMode;
  teamMembers: TeamMember[];
  teamProjects: TeamProject[];
  issues: TaskWithAttemptStatus[];
  onViewFilterChange: (filter: ViewFilter) => void;
  onFiltersChange: (filters: FilterState) => void;
  onToggleInsights: () => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onCreateIssue: () => void;
  onRefresh: () => void;
}

export function TeamIssuesHeader({
  team,
  viewFilter,
  filters,
  showInsights,
  displayMode,
  teamMembers,
  teamProjects,
  issues,
  onViewFilterChange,
  onFiltersChange,
  onToggleInsights,
  onDisplayModeChange,
  onCreateIssue,
  onRefresh,
}: TeamIssuesHeaderProps) {
  return (
    <>
      {/* Main Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{team.icon || '👥'}</span>
            <h1 className="text-lg font-semibold">{team.name}</h1>
            <span className="text-muted-foreground">/ Issues</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onCreateIssue}>
              <Plus className="h-4 w-4 mr-1" />
              New Issue
            </Button>
          </div>
        </div>
      </div>

      {/* Sub-header: View tabs + Filter/Insight/Display */}
      <div className="shrink-0 border-b px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left side: View tabs and Filter */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 ${viewFilter === 'all' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
              onClick={() => onViewFilterChange('all')}
            >
              <CircleDot className="h-4 w-4" />
              All issues
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 ${viewFilter === 'active' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
              onClick={() => onViewFilterChange('active')}
            >
              <PlayCircle className="h-4 w-4" />
              Active
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 ${viewFilter === 'backlog' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300' : 'bg-background border-border'}`}
              onClick={() => onViewFilterChange('backlog')}
            >
              <Circle className="h-4 w-4 opacity-50" strokeDasharray="2 2" />
              Backlog
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <IssueFilterDropdown
              filters={filters}
              onFiltersChange={onFiltersChange}
              teamMembers={teamMembers}
              projects={teamProjects}
              issues={issues}
            />
          </div>

          {/* Right side: Insight and Display */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${showInsights ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={onToggleInsights}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <DisplayModeToggle
              mode={displayMode}
              onModeChange={onDisplayModeChange}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export type { ViewFilter, DisplayMode };
