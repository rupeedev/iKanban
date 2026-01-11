import { Users } from 'lucide-react';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { cn } from '@/lib/utils';

interface PeopleOnlineBadgeProps {
  className?: string;
  onlineCount?: number;
  teamNames?: string[];
}

export function PeopleOnlineBadge({ className, onlineCount = 0, teamNames = [] }: PeopleOnlineBadgeProps) {
  const { toggle } = useChatPanelStore();

  const hasOnline = onlineCount > 0;
  const teamsLabel = teamNames.length > 0 ? teamNames.join(', ') : '';

  const statusText = hasOnline ? `${onlineCount.toLocaleString()} online` : 'Connect';
  const ariaLabel = teamsLabel
    ? (hasOnline ? `${teamsLabel}. ${onlineCount} people online. Open team chat.` : `${teamsLabel}. Open team chat to connect`)
    : (hasOnline ? `${onlineCount} people online. Open team chat.` : 'Open team chat to connect');

  return (
    <button
      onClick={toggle}
      data-testid="people-online-badge"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center text-xs font-medium overflow-hidden border h-6 hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        className
      )}
    >
      <span
        className={cn(
          'flex items-center p-2 border-r h-full relative',
          hasOnline
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        )}
      >
        <Users className="h-4 w-4" aria-hidden="true" />
        {hasOnline && (
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse"
            aria-hidden="true"
          />
        )}
      </span>
      {teamsLabel && (
        <span className="h-full items-center flex px-2 border-r text-muted-foreground truncate max-w-[150px]">
          {teamsLabel}
        </span>
      )}
      <span className="h-full items-center flex px-2" aria-live="polite">
        {statusText}
      </span>
    </button>
  );
}
