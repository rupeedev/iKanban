import { useRef, useCallback } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import { useProjects } from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';
import { useProjectTeamMap } from '@/hooks/useProjectTeamMap';
import { useInbox } from '@/hooks/useInbox';
import { usePulse } from '@/hooks/usePulse';
import { Button } from '@/components/ui/button';
import { getTeamSlug, getProjectSlug } from '@/lib/urlUtils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { superadminApi, teamsApi, documentsApi } from '@/lib/api';
import { teamDashboardKeys } from '@/hooks/useTeamDashboard';
import { teamMembersKeys } from '@/hooks/useTeamMembers';
import { documentsKeys } from '@/hooks/useDocuments';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  Crown,
  ListTodo,
  FolderKanban,
  Layers,
  Users,
  UserPlus,
  Plus,
  CircleDot,
  MoreHorizontal,
  Settings,
  Trash2,
  FileText,
  Activity,
  ListFilter,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Team } from 'shared/types';
import { ProjectFormDialog } from '@/components/dialogs/projects/ProjectFormDialog';
import { TeamFormDialog } from '@/components/dialogs/teams/TeamFormDialog';
import { InvitePeopleDialog } from '@/components/dialogs/teams/InvitePeopleDialog';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface SidebarSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isCollapsed?: boolean;
  onAdd?: () => void;
  collapsedIcon?: React.ElementType;
}

function SidebarSection({
  title,
  isExpanded,
  onToggle,
  children,
  isCollapsed,
  onAdd,
  collapsedIcon: CollapsedIcon,
}: SidebarSectionProps) {
  // Collapsed sidebar: show icon with popover dropdown (IKA-323)
  if (isCollapsed) {
    const Icon = CollapsedIcon || FolderKanban;
    return (
      <div className="py-1">
        <Popover>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center justify-center w-full px-3 py-1.5 text-sm rounded-md transition-colors',
                      'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <ChevronRight className="h-3 w-3 ml-0.5 opacity-50" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{title}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent
            side="right"
            align="start"
            className="w-56 p-2"
            sideOffset={8}
          >
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-medium text-muted-foreground">
                {title}
              </span>
              {onAdd && (
                <button
                  onClick={onAdd}
                  className="p-0.5 text-muted-foreground hover:text-foreground transition-all"
                  title={`Add new ${title.toLowerCase().replace('your ', '')}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-0.5">{children}</div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Expanded sidebar: normal collapsible section
  return (
    <div className="py-1 group/section">
      <div className="flex items-center w-full px-3 py-1.5">
        <button
          onClick={onToggle}
          className="flex items-center flex-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 mr-1" />
          ) : (
            <ChevronRight className="h-3 w-3 mr-1" />
          )}
          {title}
        </button>
        {onAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            className="opacity-0 group-hover/section:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
            title={`Add new ${title.toLowerCase().replace('your ', '')}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isExpanded && <div className="mt-1">{children}</div>}
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  to?: string;
  onClick?: () => void;
  isActive?: boolean;
  isCollapsed?: boolean;
  badge?: number;
  indent?: boolean;
  teamIndicator?: string;
  teamIcon?: string;
  onPrefetch?: () => void;
}

function SidebarItem({
  icon: Icon,
  label,
  to,
  onClick,
  isActive,
  isCollapsed,
  badge,
  indent,
  teamIndicator,
  teamIcon,
  onPrefetch,
}: SidebarItemProps) {
  const teamDisplay = teamIcon || teamIndicator;

  const content = (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
        indent && 'pl-7',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isCollapsed && 'mx-auto')} />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {teamDisplay && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0"
              title={teamIndicator ? `Team: ${teamIndicator}` : undefined}
            >
              {teamDisplay}
            </span>
          )}
          {badge !== undefined && badge > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            {to ? (
              <Link to={to} className="block" onMouseEnter={onPrefetch}>
                {content}
              </Link>
            ) : (
              <button
                onClick={onClick}
                className="w-full"
                onMouseEnter={onPrefetch}
              >
                {content}
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {label}
            {teamDisplay && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {teamDisplay}
              </span>
            )}
            {badge !== undefined && badge > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (to) {
    return (
      <Link to={to} onMouseEnter={onPrefetch}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="w-full" onMouseEnter={onPrefetch}>
      {content}
    </button>
  );
}

interface SidebarTeamItemProps {
  team: Team;
  isExpanded: boolean;
  onToggle: () => void;
  isCollapsed?: boolean;
  pathname: string;
  onEdit: (team: Team) => void;
  onInvite: (team: Team) => void;
  onPrefetchDashboard?: (teamId: string) => void;
  onPrefetchDocuments?: (teamId: string) => void;
  onPrefetchMembers?: (teamId: string) => void;
}

function SidebarTeamItem({
  team,
  isExpanded,
  onToggle,
  isCollapsed,
  pathname,
  onEdit,
  onInvite,
  onPrefetchDashboard,
  onPrefetchDocuments,
  onPrefetchMembers,
}: SidebarTeamItemProps) {
  const teamSlug = getTeamSlug(team);
  const teamBasePath = `/teams/${teamSlug}`;
  // Check both slug-based and ID-based paths for active state
  const isTeamActive =
    pathname.startsWith(teamBasePath) ||
    pathname.startsWith(`/teams/${team.id}`);

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={`${teamBasePath}/issues`}
              className="block"
              onMouseEnter={() => onPrefetchDashboard?.(team.id)}
            >
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer',
                  isTeamActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <span className="h-4 w-4 shrink-0 mx-auto text-base flex items-center justify-center">
                  {team.icon || '👥'}
                </span>
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{team.name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-0.5 group/team">
      {/* Team header with expand/collapse */}
      <div
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors',
          isTeamActive
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
        onMouseEnter={() => onPrefetchDashboard?.(team.id)}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <span className="h-4 w-4 shrink-0 text-base flex items-center justify-center">
            {team.icon || '👥'}
          </span>
          <span className="flex-1 truncate text-left">{team.name}</span>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover/team:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onInvite(team)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite people
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(team)}>
              <Settings className="h-4 w-4 mr-2" />
              Team settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onEdit(team)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sub-items with prefetching (IKA-335) */}
      {isExpanded && (
        <div className="space-y-0.5">
          <SidebarItem
            icon={CircleDot}
            label="Issues"
            to={`${teamBasePath}/issues`}
            isActive={pathname.includes('/issues') && isTeamActive}
            indent
            onPrefetch={() => onPrefetchDashboard?.(team.id)}
          />
          <SidebarItem
            icon={FolderKanban}
            label="Projects"
            to={`${teamBasePath}/projects`}
            isActive={pathname.includes('/projects') && isTeamActive}
            indent
            onPrefetch={() => onPrefetchDashboard?.(team.id)}
          />
          <SidebarItem
            icon={Layers}
            label="Views"
            to={`${teamBasePath}/views`}
            isActive={pathname.includes('/views') && isTeamActive}
            indent
            onPrefetch={() => onPrefetchDashboard?.(team.id)}
          />
          <SidebarItem
            icon={FileText}
            label="Documents"
            to={`${teamBasePath}/documents`}
            isActive={pathname.includes('/documents') && isTeamActive}
            indent
            onPrefetch={() => onPrefetchDocuments?.(team.id)}
          />
          <SidebarItem
            icon={Users}
            label="Members"
            to={`${teamBasePath}/members`}
            isActive={pathname.includes('/members') && isTeamActive}
            indent
            onPrefetch={() => onPrefetchMembers?.(team.id)}
          />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { projectId } = useParams();
  const {
    isCollapsed,
    toggleCollapsed,
    sections,
    toggleSection,
    expandedTeams,
    toggleTeamExpanded,
  } = useSidebar();
  const { projects } = useProjects();
  const { teams } = useTeams();
  const { getTeamForProject } = useProjectTeamMap(teams);
  const { user, isLoaded: isClerkLoaded } = useUser();

  // Notification summaries for badges (IKA-343)
  const { summary: inboxSummary } = useInbox();
  const { summary: pulseSummary } = usePulse();

  // Check if user is superadmin (for showing Superadmin link)
  const { data: superadminCheck } = useQuery({
    queryKey: ['superadmin', 'check'],
    queryFn: () => superadminApi.check(),
    enabled: isClerkLoaded && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 403 (expected for non-superadmins)
      if (error && 'status' in error && error.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const isSuperadmin = superadminCheck?.is_superadmin ?? false;

  // Query client for prefetching (IKA-302, IKA-335)
  const queryClient = useQueryClient();

  // Debounce timer refs to prevent rapid prefetching on fast mouse movement (IKA-335)
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PREFETCH_DELAY_MS = 100; // Wait 100ms before prefetching to debounce

  // Prefetch team dashboard on hover for faster navigation (IKA-302, enhanced in IKA-335)
  const handlePrefetchDashboard = useCallback(
    (teamId: string) => {
      // Clear any pending prefetch
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }

      // Debounce prefetch to avoid rapid firing on fast mouse movement
      prefetchTimerRef.current = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: teamDashboardKeys.team(teamId),
          queryFn: () => teamsApi.getDashboard(teamId),
          staleTime: 5 * 60 * 1000, // 5 minutes
        });
      }, PREFETCH_DELAY_MS);
    },
    [queryClient]
  );

  // Prefetch documents data on hover (IKA-335)
  const handlePrefetchDocuments = useCallback(
    (teamId: string) => {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }

      prefetchTimerRef.current = setTimeout(() => {
        // Prefetch both documents list (root folder) and folders list
        queryClient.prefetchQuery({
          queryKey: documentsKeys.list(teamId, null),
          queryFn: () => documentsApi.list(teamId, {}),
          staleTime: 5 * 60 * 1000,
        });
        queryClient.prefetchQuery({
          queryKey: documentsKeys.folders(teamId),
          queryFn: () => documentsApi.listFolders(teamId),
          staleTime: 5 * 60 * 1000,
        });
      }, PREFETCH_DELAY_MS);
    },
    [queryClient]
  );

  // Prefetch members data on hover (IKA-335)
  const handlePrefetchMembers = useCallback(
    (teamId: string) => {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }

      prefetchTimerRef.current = setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: teamMembersKeys.members(teamId),
          queryFn: () => teamsApi.getMembers(teamId),
          staleTime: 6 * 60 * 60 * 1000, // 6 hours - members rarely change
        });
      }, PREFETCH_DELAY_MS);
    },
    [queryClient]
  );

  const handleCreateProject = async () => {
    try {
      await ProjectFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  const handleCreateTeam = async () => {
    try {
      await TeamFormDialog.show({});
    } catch {
      // User cancelled
    }
  };

  const handleEditTeam = async (team: Team) => {
    try {
      await TeamFormDialog.show({ editTeam: team });
    } catch {
      // User cancelled
    }
  };

  const handleInviteTeam = async (team: Team) => {
    try {
      await InvitePeopleDialog.show({ teamId: team.id, teamName: team.name });
    } catch {
      // User cancelled
    }
  };

  const isProjectActive = (project: { id: string; name: string }) => {
    // Compare both UUID and slug for backwards compatibility
    return projectId === project.id || projectId === getProjectSlug(project);
  };

  return (
    <div
      className={cn(
        'h-full flex flex-col border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="flex items-center h-12 px-2 border-b gap-1">
        <WorkspaceSwitcher isCollapsed={isCollapsed} />
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={toggleCollapsed}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 mx-auto"
            onClick={toggleCollapsed}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Top Items */}
        <div className="px-2 space-y-0.5">
          {/* Superadmin link - only visible to superadmins */}
          {isSuperadmin && (
            <SidebarItem
              icon={Crown}
              label="Superadmin"
              to="/superadmin/registrations"
              isActive={location.pathname.startsWith('/superadmin')}
              isCollapsed={isCollapsed}
            />
          )}
          <SidebarItem
            icon={ShieldCheck}
            label="Admin"
            to="/admin"
            isActive={location.pathname.startsWith('/admin')}
            isCollapsed={isCollapsed}
          />
          <SidebarItem
            icon={Activity}
            label="Activity"
            to="/activity"
            isActive={location.pathname === '/activity'}
            isCollapsed={isCollapsed}
            badge={
              pulseSummary?.unread_count
                ? Number(pulseSummary.unread_count)
                : undefined
            }
          />
          <SidebarItem
            icon={ListFilter}
            label="Triage"
            to="/triage"
            isActive={location.pathname === '/triage'}
            isCollapsed={isCollapsed}
            badge={
              inboxSummary?.unread_count
                ? Number(inboxSummary.unread_count)
                : undefined
            }
          />
          <SidebarItem
            icon={ListTodo}
            label="My Issues"
            to="/my-issues"
            isActive={location.pathname === '/my-issues'}
            isCollapsed={isCollapsed}
          />
        </div>

        {/* Your Projects Section */}
        <div className="mt-4 px-2">
          <SidebarSection
            title="Your projects"
            isExpanded={sections.teams}
            onToggle={() => toggleSection('teams')}
            isCollapsed={isCollapsed}
            onAdd={handleCreateProject}
            collapsedIcon={FolderKanban}
          >
            <div className="space-y-0.5">
              {projects.map((project) => {
                const teamInfo = getTeamForProject(project.id);
                return (
                  <SidebarItem
                    key={project.id}
                    icon={FolderKanban}
                    label={project.name}
                    to={`/projects/${getProjectSlug(project)}/tasks`}
                    isActive={isProjectActive(project)}
                    isCollapsed={false}
                    teamIndicator={
                      teamInfo?.teamIdentifier || teamInfo?.teamName
                    }
                    teamIcon={teamInfo?.teamIcon || undefined}
                  />
                );
              })}
              {projects.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">
                  No projects yet
                </div>
              )}
            </div>
          </SidebarSection>
        </div>

        {/* Your Teams Section */}
        <div className="mt-2 px-2">
          <SidebarSection
            title="Your teams"
            isExpanded={sections.yourTeams}
            onToggle={() => toggleSection('yourTeams')}
            isCollapsed={isCollapsed}
            onAdd={handleCreateTeam}
            collapsedIcon={Users}
          >
            <div className="space-y-0.5">
              {teams.map((team) => (
                <SidebarTeamItem
                  key={team.id}
                  team={team}
                  isExpanded={expandedTeams[team.id] ?? false}
                  onToggle={() => toggleTeamExpanded(team.id)}
                  isCollapsed={false}
                  pathname={location.pathname}
                  onEdit={handleEditTeam}
                  onInvite={handleInviteTeam}
                  onPrefetchDashboard={handlePrefetchDashboard}
                  onPrefetchDocuments={handlePrefetchDocuments}
                  onPrefetchMembers={handlePrefetchMembers}
                />
              ))}
              {teams.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">
                  No teams yet
                </div>
              )}
            </div>
          </SidebarSection>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t">
        {/* Settings Link */}
        <div className={cn('px-2 py-2', isCollapsed && 'flex justify-center')}>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/settings"
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors',
                    'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    location.pathname.startsWith('/settings') &&
                      'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>Settings</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">Settings</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        {/* Brand */}
        {!isCollapsed && (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">iKanban</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
