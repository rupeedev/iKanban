import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { OnlineMember } from '@/types/chat';

interface OnlineMembersListProps {
  members?: OnlineMember[];
  className?: string;
}

export function OnlineMembersList({
  members = [],
  className,
}: OnlineMembersListProps) {
  const onlineMembers = members.filter((m) => m.isOnline);

  if (onlineMembers.length === 0) {
    return (
      <div className={cn('px-4 py-3 border-b', className)}>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Online Now
        </p>
        <p className="text-sm text-muted-foreground">No one else online</p>
      </div>
    );
  }

  return (
    <div className={cn('px-4 py-3 border-b', className)}>
      <p className="text-xs font-medium text-muted-foreground mb-3">
        Online Now ({onlineMembers.length})
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {onlineMembers.map((member) => (
          <OnlineMemberAvatar key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}

function OnlineMemberAvatar({ member }: { member: OnlineMember }) {
  const initials = member.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col items-center gap-1 min-w-[48px]">
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage
            src={member.avatarUrl || undefined}
            alt={member.displayName}
          />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background"
          aria-hidden="true"
        />
      </div>
      <span className="text-xs font-medium truncate max-w-[56px]">
        {member.displayName.split(' ')[0]}
      </span>
      {member.teamName && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">
          {member.teamName}
        </span>
      )}
    </div>
  );
}
