import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface SidebarItemProps {
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
}

export function SidebarItem({
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
              <Link to={to} className="block">
                {content}
              </Link>
            ) : (
              <button onClick={onClick} className="w-full">
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
    return <Link to={to}>{content}</Link>;
  }

  return (
    <button onClick={onClick} className="w-full">
      {content}
    </button>
  );
}
