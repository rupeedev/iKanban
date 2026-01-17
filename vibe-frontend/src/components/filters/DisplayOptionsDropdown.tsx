import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  SlidersHorizontal,
  Layers,
  ArrowUpDown,
  Check,
  AlertCircle,
  User,
  Calendar,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type GroupByOption = 'status' | 'priority' | 'assignee' | 'none';
export type SortByOption = 'created' | 'updated' | 'priority';
export type SortDirection = 'asc' | 'desc';

export interface DisplayOptions {
  groupBy: GroupByOption;
  sortBy: SortByOption;
  sortDirection: SortDirection;
}

interface DisplayOptionsDropdownProps {
  options: DisplayOptions;
  onOptionsChange: (options: DisplayOptions) => void;
}

const GROUP_BY_OPTIONS: {
  value: GroupByOption;
  label: string;
  icon: typeof Layers;
}[] = [
  { value: 'status', label: 'Status', icon: Layers },
  { value: 'priority', label: 'Priority', icon: AlertCircle },
  { value: 'assignee', label: 'Assignee', icon: User },
  { value: 'none', label: 'No grouping', icon: Layers },
];

const SORT_BY_OPTIONS: {
  value: SortByOption;
  label: string;
  icon: typeof Calendar;
}[] = [
  { value: 'created', label: 'Created date', icon: Calendar },
  { value: 'updated', label: 'Updated date', icon: Clock },
  { value: 'priority', label: 'Priority', icon: AlertCircle },
];

export function DisplayOptionsDropdown({
  options,
  onOptionsChange,
}: DisplayOptionsDropdownProps) {
  const handleGroupByChange = (groupBy: GroupByOption) => {
    onOptionsChange({ ...options, groupBy });
  };

  const handleSortByChange = (sortBy: SortByOption) => {
    onOptionsChange({ ...options, sortBy });
  };

  const toggleSortDirection = () => {
    onOptionsChange({
      ...options,
      sortDirection: options.sortDirection === 'asc' ? 'desc' : 'asc',
    });
  };

  const isCustomized =
    options.groupBy !== 'status' ||
    options.sortBy !== 'created' ||
    options.sortDirection !== 'desc';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'text-muted-foreground hover:text-foreground gap-1.5 h-7 text-xs',
            isCustomized && 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 bg-background border-border text-foreground p-0"
      >
        {/* Group By Section */}
        <div className="border-b p-3">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Group by</span>
          </div>
          <div className="space-y-0.5">
            {GROUP_BY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = options.groupBy === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleGroupByChange(option.value)}
                  className={cn(
                    'w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm',
                    'hover:bg-muted/50 cursor-pointer transition-colors',
                    isSelected && 'bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sort By Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Sort by</span>
            </div>
            <button
              onClick={toggleSortDirection}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/50"
            >
              {options.sortDirection === 'desc' ? '↓ Newest' : '↑ Oldest'}
            </button>
          </div>
          <div className="space-y-0.5">
            {SORT_BY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = options.sortBy === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleSortByChange(option.value)}
                  className={cn(
                    'w-full flex items-center gap-2 py-1.5 px-2 rounded text-sm',
                    'hover:bg-muted/50 cursor-pointer transition-colors',
                    isSelected && 'bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
