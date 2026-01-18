import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getTeamSlug } from '@/lib/urlUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Layers,
  Users,
  UserPlus,
  CircleDot,
  MoreHorizontal,
  Settings,
  Trash2,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Team } from 'shared/types';
import { SidebarItem } from './SidebarItem';

export interface SidebarTeamItemProps {
  team: Team;
  isExpanded: boolean;
  onToggle: () => void;
  isCollapsed?: boolean;
  pathname: string;
  onEdit: (team: Team) => void;
  onInvite: (team: Team) => void;
}

export function SidebarTeamItem({
  team,
  isExpanded,
  onToggle,
  isCollapsed,
  pathname,
  onEdit,
  onInvite,
}: SidebarTeamItemProps) {
  const teamSlug = getTeamSlug(team);
  const teamBasePath = `/teams/${teamSlug}`;
  const isTeamActive =
    pathname.startsWith(teamBasePath) ||
    pathname.startsWith(`/teams/${team.id}`);

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={`${teamBasePath}/issues`} className="block">
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
      <div
        className={cn(
          'flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors',
          isTeamActive
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
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

      {isExpanded && (
        <div className="space-y-0.5">
          <SidebarItem
            icon={CircleDot}
            label="Issues"
            to={`${teamBasePath}/issues`}
            isActive={pathname.includes('/issues') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={FolderKanban}
            label="Projects"
            to={`${teamBasePath}/projects`}
            isActive={pathname.includes('/projects') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={Layers}
            label="Views"
            to={`${teamBasePath}/views`}
            isActive={pathname.includes('/views') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={FileText}
            label="Documents"
            to={`${teamBasePath}/documents`}
            isActive={pathname.includes('/documents') && isTeamActive}
            indent
          />
          <SidebarItem
            icon={Users}
            label="Members"
            to={`${teamBasePath}/members`}
            isActive={pathname.includes('/members') && isTeamActive}
            indent
          />
        </div>
      )}
    </div>
  );
}
