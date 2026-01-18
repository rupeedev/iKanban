import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SlidersHorizontal, List, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DisplayMode = 'board' | 'list';

interface DisplayModeToggleProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export function DisplayModeToggle({
  mode,
  onModeChange,
}: DisplayModeToggleProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 bg-background border-border text-foreground p-2"
      >
        {/* Mode Toggle Tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-md">
          <button
            onClick={() => onModeChange('list')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors',
              mode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="h-4 w-4" />
            List
          </button>
          <button
            onClick={() => onModeChange('board')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded text-sm font-medium transition-colors',
              mode === 'board'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
