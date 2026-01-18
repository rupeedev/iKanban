import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  isToday,
  isSameMonth,
  differenceInDays,
  parseISO,
  isValid,
} from 'date-fns';
import {
  ChevronRight,
  ChevronDown,
  Circle,
  Loader2,
  User,
  AlertCircle,
  Signal,
  SignalMedium,
  SignalLow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusIcon } from '@/utils/StatusIcons';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { TaskWithAttemptStatus, Tag } from 'shared/types';

// Priority configuration
const PRIORITY_CONFIG = [
  { value: 0, icon: Circle, color: 'text-muted-foreground' },
  { value: 1, icon: AlertCircle, color: 'text-orange-500' },
  { value: 2, icon: Signal, color: 'text-orange-400' },
  { value: 3, icon: SignalMedium, color: 'text-yellow-500' },
  { value: 4, icon: SignalLow, color: 'text-blue-400' },
];

// Helper type for team member info
interface TeamMemberInfo {
  id: string;
  name: string;
  avatar?: string;
}

type TimeScale = 'day' | 'week' | 'month' | 'year';

interface TimelineViewProps {
  tasks: TaskWithAttemptStatus[];
  taskTagsMap: Map<string, Tag[]>;
  teamIdentifier?: string;
  teamMembers?: TeamMemberInfo[];
  onTaskClick: (task: TaskWithAttemptStatus) => void;
  isLoadingTags?: boolean;
}

interface GroupedTasks {
  [tagName: string]: TaskWithAttemptStatus[];
}

// Calculate the date range for the timeline
function getDateRange(tasks: TaskWithAttemptStatus[]) {
  const now = new Date();
  const tasksWithDates = tasks.filter((t) => t.due_date);

  if (tasksWithDates.length === 0) {
    // Default range: 6 months before and after today
    return {
      start: addMonths(startOfMonth(now), -3),
      end: addMonths(endOfMonth(now), 3),
    };
  }

  const dates = tasksWithDates
    .map((t) => parseISO(t.due_date!))
    .filter(isValid);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  // Add padding
  return {
    start: addMonths(startOfMonth(minDate), -1),
    end: addMonths(endOfMonth(maxDate), 2),
  };
}

// Get column headers based on scale
function getTimelineHeaders(start: Date, end: Date, scale: TimeScale) {
  if (scale === 'year') {
    return eachMonthOfInterval({ start, end }).map((date) => ({
      date,
      label: format(date, 'MMM'),
      sublabel: format(date, 'yyyy'),
      isCurrentPeriod: isSameMonth(date, new Date()),
    }));
  }

  if (scale === 'month') {
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(
      (date) => ({
        date,
        label: format(date, 'd'),
        sublabel: format(date, 'MMM'),
        isCurrentPeriod:
          differenceInDays(new Date(), date) >= 0 &&
          differenceInDays(new Date(), date) < 7,
      })
    );
  }

  if (scale === 'week') {
    return eachDayOfInterval({ start, end }).map((date) => ({
      date,
      label: format(date, 'd'),
      sublabel: format(date, 'EEE'),
      isCurrentPeriod: isToday(date),
    }));
  }

  // Day scale
  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    label: format(date, 'd'),
    sublabel: format(date, 'EEE'),
    isCurrentPeriod: isToday(date),
  }));
}

// Calculate task position on timeline
function getTaskPosition(
  task: TaskWithAttemptStatus,
  start: Date,
  end: Date,
  totalWidth: number
): { left: number; width: number } | null {
  if (!task.due_date) return null;

  const dueDate = parseISO(task.due_date);
  if (!isValid(dueDate)) return null;

  const totalDays = differenceInDays(end, start);
  const taskDayOffset = differenceInDays(dueDate, start);

  // Task is outside visible range
  if (taskDayOffset < 0 || taskDayOffset > totalDays) return null;

  const left = (taskDayOffset / totalDays) * totalWidth;
  // Task bar width - approximately 3 days worth or minimum width
  const width = Math.max((3 / totalDays) * totalWidth, 80);

  return { left, width };
}

// Get today marker position
function getTodayPosition(start: Date, end: Date, totalWidth: number): number {
  const totalDays = differenceInDays(end, start);
  const todayOffset = differenceInDays(new Date(), start);
  return (todayOffset / totalDays) * totalWidth;
}

// Group tasks by their primary tag (first tag or "No Feature")
function groupTasksByTag(
  tasks: TaskWithAttemptStatus[],
  taskTagsMap: Map<string, Tag[]>
): GroupedTasks {
  const grouped: GroupedTasks = {};

  tasks.forEach((task) => {
    const taskTags = taskTagsMap.get(task.id) || [];
    const primaryTag = taskTags[0];
    const groupName = primaryTag?.tag_name || 'No Feature';

    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }
    grouped[groupName].push(task);
  });

  // Sort groups: No Feature last
  const sortedGroups: GroupedTasks = {};
  const keys = Object.keys(grouped).sort((a, b) => {
    if (a === 'No Feature') return 1;
    if (b === 'No Feature') return -1;
    return a.localeCompare(b);
  });

  keys.forEach((key) => {
    sortedGroups[key] = grouped[key].sort((a, b) => {
      // Sort by due date within group
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
    });
  });

  return sortedGroups;
}

// Get issue key from team identifier and issue number
function getIssueKey(
  teamIdentifier: string | undefined,
  issueNumber: number | null | undefined
): string | null {
  if (!teamIdentifier || !issueNumber) return null;
  return `${teamIdentifier}-${issueNumber}`;
}

interface TaskRowProps {
  task: TaskWithAttemptStatus;
  teamIdentifier?: string;
  teamMembers?: TeamMemberInfo[];
  start: Date;
  end: Date;
  containerWidth: number;
  onTaskClick: (task: TaskWithAttemptStatus) => void;
}

function TaskRow({
  task,
  teamIdentifier,
  teamMembers = [],
  start,
  end,
  containerWidth,
  onTaskClick,
}: TaskRowProps) {
  const position = getTaskPosition(task, start, end, containerWidth);
  const issueKey = getIssueKey(teamIdentifier, task.issue_number);

  // Get priority icon
  const priorityConfig =
    PRIORITY_CONFIG.find((p) => p.value === (task.priority ?? 0)) ||
    PRIORITY_CONFIG[0];
  const PriorityIcon = priorityConfig.icon;

  // Get assignee info
  const assignee = teamMembers.find((m) => m.id === task.assignee_id);
  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="h-10 relative flex items-center">
      {/* Task info on left */}
      <div className="w-80 flex-shrink-0 flex items-center gap-2 px-3 border-r border-border/30">
        {/* Priority icon */}
        <PriorityIcon
          className={cn('h-3.5 w-3.5 flex-shrink-0', priorityConfig.color)}
        />
        <StatusIcon
          status={task.status}
          className="h-3.5 w-3.5 flex-shrink-0"
        />
        {issueKey && (
          <span className="text-xs text-muted-foreground font-mono w-14 flex-shrink-0">
            {issueKey}
          </span>
        )}
        <span
          className="text-sm truncate cursor-pointer hover:text-primary flex-1"
          onClick={() => onTaskClick(task)}
          title={task.title}
        >
          {task.title}
        </span>
        {/* Assignee avatar */}
        <Avatar className="h-5 w-5 flex-shrink-0">
          {assignee?.avatar ? (
            <AvatarImage src={assignee.avatar} alt={assignee.name} />
          ) : null}
          <AvatarFallback className="text-[9px] bg-muted">
            {assignee ? (
              getInitials(assignee.name)
            ) : (
              <User className="h-3 w-3" />
            )}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Timeline bar area */}
      <div className="flex-1 relative h-full">
        {position && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-6 rounded border',
              'bg-primary/10 border-primary/30 cursor-pointer',
              'hover:bg-primary/20 hover:border-primary/50 transition-colors',
              'flex items-center px-2 overflow-hidden'
            )}
            style={{
              left: position.left,
              width: position.width,
            }}
            onClick={() => onTaskClick(task)}
          >
            <span className="text-xs truncate text-primary">
              {task.due_date && format(parseISO(task.due_date), 'MMM d')}
            </span>
          </div>
        )}
        {!position && !task.due_date && (
          <div className="absolute top-1/2 left-4 -translate-y-1/2 text-xs text-muted-foreground italic">
            No due date
          </div>
        )}
      </div>
    </div>
  );
}

export function TimelineView({
  tasks,
  taskTagsMap,
  teamIdentifier,
  teamMembers = [],
  onTaskClick,
  isLoadingTags,
}: TimelineViewProps) {
  const [scale, setScale] = useState<TimeScale>('year');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['all'])
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const todayRef = useRef<HTMLDivElement>(null);

  // Calculate date range
  const { start, end } = useMemo(() => getDateRange(tasks), [tasks]);

  // Get timeline headers
  const headers = useMemo(
    () => getTimelineHeaders(start, end, scale),
    [start, end, scale]
  );

  // Group tasks by tag
  const groupedTasks = useMemo(
    () => groupTasksByTag(tasks, taskTagsMap),
    [tasks, taskTagsMap]
  );

  // Today marker position
  const todayPosition = useMemo(
    () => getTodayPosition(start, end, containerWidth - 320), // 320 = left column width (w-80)
    [start, end, containerWidth]
  );

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Scroll to today on mount
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [containerWidth]);

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setExpandedGroups((prev) => {
      if (prev.has('all')) {
        return new Set();
      }
      const allGroups = new Set(['all', ...Object.keys(groupedTasks)]);
      return allGroups;
    });
  }, [groupedTasks]);

  const timelineWidth = containerWidth - 320; // 320 = left column width (w-80)
  const columnWidth = timelineWidth / headers.length;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Circle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No tasks to display on timeline</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
          {isLoadingTags && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          {(['day', 'week', 'month', 'year'] as TimeScale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                'px-3 py-1 text-xs rounded transition-colors',
                scale === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline header */}
      <div className="flex border-b bg-muted/30 sticky top-10 z-10">
        <div className="w-80 flex-shrink-0 px-3 py-2 border-r border-border/30">
          <button
            onClick={toggleAll}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {expandedGroups.has('all') ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Feature
          </button>
        </div>
        <div
          className="flex-1 flex overflow-x-auto relative"
          style={{ minWidth: timelineWidth }}
        >
          {headers.map((header, idx) => (
            <div
              key={idx}
              className={cn(
                'text-center py-2 border-r border-border/20 flex-shrink-0',
                header.isCurrentPeriod && 'bg-primary/5'
              )}
              style={{ width: columnWidth }}
            >
              <div className="text-xs font-medium">{header.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {header.sublabel}
              </div>
            </div>
          ))}
          {/* Today marker reference point */}
          <div
            ref={todayRef}
            className="absolute top-0 h-full w-0.5 bg-red-500 z-20"
            style={{ left: todayPosition + 320 }}
          />
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-auto">
        {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
          const isExpanded =
            expandedGroups.has('all') || expandedGroups.has(groupName);

          return (
            <div key={groupName} className="border-b border-border/30">
              {/* Group header */}
              <div
                className="flex items-center h-10 bg-muted/20 cursor-pointer hover:bg-muted/30"
                onClick={() => toggleGroup(groupName)}
              >
                <div className="w-80 flex-shrink-0 flex items-center gap-2 px-3 border-r border-border/30">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium truncate">
                    {groupName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {groupTasks.length}
                  </span>
                </div>
                <div
                  className="flex-1 relative h-full"
                  style={{ minWidth: timelineWidth }}
                >
                  {/* Today marker line */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-red-500/30 z-10"
                    style={{ left: todayPosition }}
                  />
                </div>
              </div>

              {/* Group tasks */}
              {isExpanded && (
                <div className="bg-background">
                  {groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      teamIdentifier={teamIdentifier}
                      teamMembers={teamMembers}
                      start={start}
                      end={end}
                      containerWidth={timelineWidth}
                      onTaskClick={onTaskClick}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
