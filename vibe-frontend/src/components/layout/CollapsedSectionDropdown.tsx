import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CollapsedSectionDropdownProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  hasItems: boolean;
}

export function CollapsedSectionDropdown({
  icon: Icon,
  title,
  children,
  hasItems,
}: CollapsedSectionDropdownProps) {
  if (!hasItems) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center justify-center w-full px-3 py-1.5 text-sm rounded-md',
            'transition-colors cursor-pointer',
            'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          )}
          title={title}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-56 p-1">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 border-b mb-1">
          {title}
        </div>
        <div className="max-h-64 overflow-y-auto">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
