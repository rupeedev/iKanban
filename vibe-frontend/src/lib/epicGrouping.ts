/**
 * Epic/Story grouping utilities for the dashboard.
 * IKA-235: Enhanced visual hierarchy for epic → story → task relationships.
 *
 * This module provides:
 * - Epic detection from task titles using naming conventions
 * - Story grouping within epics
 * - Progress calculation at epic and story levels
 * - Completion date tracking
 */
import type { TaskWithAttemptStatus } from 'shared/types';
import { FEATURE_COLORS } from './featureDetection';

/**
 * Epic naming patterns for detection.
 * Matches tasks with patterns like:
 * - "EPIC-P1-01: Description" (phase/task format)
 * - "AUTH: Login feature" (colon-based)
 * - "[FRONTEND] Component" (bracket-based)
 */
const EPIC_PATTERNS = [
  // Match "EPIC-PX-XX:" or "EPIC-PX:" pattern (e.g., "FRONTEND-P2-01:")
  /^([A-Z][A-Z0-9_-]+)-P\d+-?\d*:\s*/i,
  // Match "EPIC:" pattern (e.g., "AUTH:", "FRONTEND:")
  /^([A-Z][A-Z0-9_-]+):\s*/i,
  // Match "[EPIC]" pattern (e.g., "[FRONTEND]", "[AUTH]")
  /^\[([A-Z][A-Z0-9_-]+)\]\s*/i,
];

/**
 * Story detection patterns within an epic.
 * Matches tasks with patterns like:
 * - "Add login button" → Story: "Login"
 * - "Fix auth token refresh" → Story: "Auth Token"
 */
const STORY_KEYWORDS: Record<string, string[]> = {
  Setup: ['setup', 'init', 'bootstrap', 'scaffold', 'configure'],
  Authentication: [
    'auth',
    'login',
    'logout',
    'sign-in',
    'sign-out',
    'token',
    'session',
  ],
  Dashboard: ['dashboard', 'overview', 'summary', 'metrics', 'stats'],
  Forms: ['form', 'input', 'validation', 'submit', 'field'],
  Lists: ['list', 'table', 'grid', 'pagination', 'filter', 'sort'],
  CRUD: ['create', 'read', 'update', 'delete', 'add', 'edit', 'remove'],
  API: ['api', 'endpoint', 'request', 'response', 'fetch'],
  UI: ['ui', 'component', 'layout', 'style', 'design', 'button', 'modal'],
  Testing: ['test', 'spec', 'e2e', 'unit', 'playwright'],
  Other: [], // Fallback for unmatched tasks
};

export interface StoryGroup {
  storyId: string;
  storyName: string;
  tasks: TaskWithAttemptStatus[];
  doneCount: number;
  totalCount: number;
  percentage: number;
  completedAt: Date | null;
}

export interface EpicGroup {
  epicId: string;
  epicName: string;
  epicColor: string;
  stories: StoryGroup[];
  totalTasks: number;
  doneTasks: number;
  percentage: number;
  healthStatus: 'on-track' | 'at-risk' | 'blocked' | 'completed';
  startDate: Date | null;
  completedAt: Date | null;
}

export interface DashboardStats {
  totalTasks: number;
  doneTasks: number;
  percentage: number;
  atRiskCount: number;
  epicCount: number;
}

/**
 * Detect epic name from task title.
 * Returns null if no epic pattern is found.
 */
function detectEpic(title: string): string | null {
  for (const pattern of EPIC_PATTERNS) {
    const match = title.match(pattern);
    if (match?.[1]) {
      // Normalize epic name: uppercase, replace dashes/underscores with spaces
      return match[1].toUpperCase().replace(/[-_]/g, ' ').trim();
    }
  }
  return null;
}

/**
 * Detect story from task title based on keywords.
 * Falls back to "Other" if no keywords match.
 */
function detectStory(title: string, description?: string | null): string {
  const text = `${title} ${description || ''}`.toLowerCase();

  for (const [storyName, keywords] of Object.entries(STORY_KEYWORDS)) {
    if (storyName === 'Other') continue;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        return storyName;
      }
    }
  }

  return 'Other';
}

/**
 * Get completion date for a task (if done).
 */
function getCompletionDate(task: TaskWithAttemptStatus): Date | null {
  if (task.status !== 'done') return null;
  // Use updated_at as proxy for completion date
  return task.updated_at ? new Date(task.updated_at) : null;
}

/**
 * Get health status for an epic based on its tasks.
 */
function getHealthStatus(
  tasks: TaskWithAttemptStatus[]
): EpicGroup['healthStatus'] {
  const total = tasks.length;
  if (total === 0) return 'on-track';

  const done = tasks.filter((t) => t.status === 'done').length;
  const blocked = tasks.filter((t) => t.status === 'cancelled').length;
  const inProgress = tasks.filter(
    (t) => t.status === 'inprogress' || t.status === 'inreview'
  ).length;

  // All done
  if (done === total) return 'completed';

  // Has blocked tasks
  if (blocked > 0) return 'blocked';

  // Low progress with no active work
  if (done / total < 0.3 && inProgress === 0) return 'at-risk';

  return 'on-track';
}

/**
 * Generate a color for an epic based on its name.
 */
function getEpicColor(epicName: string): string {
  // Try to match with feature colors first
  for (const [feature, color] of Object.entries(FEATURE_COLORS)) {
    if (
      epicName.toLowerCase().includes(feature.toLowerCase()) ||
      feature.toLowerCase().includes(epicName.toLowerCase())
    ) {
      return color;
    }
  }

  // Generate a consistent color based on epic name hash
  const colors = [
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#ec4899', // pink
    '#14b8a6', // teal
    '#a855f7', // purple
    '#f97316', // orange
  ];

  let hash = 0;
  for (let i = 0; i < epicName.length; i++) {
    hash = epicName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Group tasks by epic and story.
 * Creates a hierarchical structure: Epic → Story → Tasks
 */
export function groupTasksByEpicAndStory(
  tasks: TaskWithAttemptStatus[]
): EpicGroup[] {
  const epicMap = new Map<string, Map<string, TaskWithAttemptStatus[]>>();

  // First pass: group tasks by epic and story
  for (const task of tasks) {
    const epicName = detectEpic(task.title) || 'Uncategorized';
    const storyName = detectStory(task.title, task.description);

    if (!epicMap.has(epicName)) {
      epicMap.set(epicName, new Map());
    }

    const storyMap = epicMap.get(epicName)!;
    if (!storyMap.has(storyName)) {
      storyMap.set(storyName, []);
    }

    storyMap.get(storyName)!.push(task);
  }

  // Second pass: build EpicGroup structures
  const epics: EpicGroup[] = [];

  for (const [epicName, storyMap] of epicMap.entries()) {
    const stories: StoryGroup[] = [];
    let totalTasks = 0;
    let doneTasks = 0;
    let earliestDate: Date | null = null;
    let latestCompletionDate: Date | null = null;

    for (const [storyName, storyTasks] of storyMap.entries()) {
      const storyDone = storyTasks.filter((t) => t.status === 'done').length;
      const storyTotal = storyTasks.length;

      // Find story completion date (latest task completion in story)
      let storyCompletedAt: Date | null = null;
      if (storyDone === storyTotal && storyTotal > 0) {
        for (const task of storyTasks) {
          const taskCompleted = getCompletionDate(task);
          if (
            taskCompleted &&
            (!storyCompletedAt || taskCompleted > storyCompletedAt)
          ) {
            storyCompletedAt = taskCompleted;
          }
        }
      }

      // Track earliest task date
      for (const task of storyTasks) {
        const taskDate = new Date(task.created_at);
        if (!earliestDate || taskDate < earliestDate) {
          earliestDate = taskDate;
        }
      }

      // Track latest completion for epic
      if (storyCompletedAt) {
        if (!latestCompletionDate || storyCompletedAt > latestCompletionDate) {
          latestCompletionDate = storyCompletedAt;
        }
      }

      stories.push({
        storyId: `${epicName}-${storyName}`.toLowerCase().replace(/\s+/g, '-'),
        storyName,
        tasks: storyTasks,
        doneCount: storyDone,
        totalCount: storyTotal,
        percentage:
          storyTotal > 0 ? Math.round((storyDone / storyTotal) * 100) : 0,
        completedAt: storyCompletedAt,
      });

      totalTasks += storyTotal;
      doneTasks += storyDone;
    }

    // Sort stories: active first (not 100%), then completed, then Other last
    stories.sort((a, b) => {
      if (a.storyName === 'Other') return 1;
      if (b.storyName === 'Other') return -1;
      if (a.percentage === 100 && b.percentage !== 100) return 1;
      if (a.percentage !== 100 && b.percentage === 100) return -1;
      return b.percentage - a.percentage;
    });

    const allTasks = Array.from(storyMap.values()).flat();

    epics.push({
      epicId: epicName.toLowerCase().replace(/\s+/g, '-'),
      epicName,
      epicColor: getEpicColor(epicName),
      stories,
      totalTasks,
      doneTasks,
      percentage:
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      healthStatus: getHealthStatus(allTasks),
      startDate: earliestDate,
      completedAt: doneTasks === totalTasks ? latestCompletionDate : null,
    });
  }

  // Sort epics: active first, completed at end, Uncategorized always last
  epics.sort((a, b) => {
    if (a.epicName === 'Uncategorized') return 1;
    if (b.epicName === 'Uncategorized') return -1;
    if (a.healthStatus === 'completed' && b.healthStatus !== 'completed')
      return 1;
    if (a.healthStatus !== 'completed' && b.healthStatus === 'completed')
      return -1;
    if (a.healthStatus === 'at-risk' && b.healthStatus !== 'at-risk') return -1;
    if (a.healthStatus !== 'at-risk' && b.healthStatus === 'at-risk') return 1;
    return b.percentage - a.percentage;
  });

  return epics;
}

/**
 * Calculate dashboard summary stats from epic groups.
 */
export function calculateDashboardStats(epics: EpicGroup[]): DashboardStats {
  let totalTasks = 0;
  let doneTasks = 0;
  let atRiskCount = 0;

  for (const epic of epics) {
    totalTasks += epic.totalTasks;
    doneTasks += epic.doneTasks;
    if (epic.healthStatus === 'at-risk' || epic.healthStatus === 'blocked') {
      atRiskCount++;
    }
  }

  return {
    totalTasks,
    doneTasks,
    percentage: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    atRiskCount,
    epicCount: epics.length,
  };
}
