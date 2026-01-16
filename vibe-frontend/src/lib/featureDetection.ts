/**
 * Intelligent feature detection for categorizing tasks by keywords in titles.
 * IKA-113: Replaces tag-based grouping with keyword-based detection.
 *
 * This utility provides:
 * - Keyword-to-feature mapping for automatic task categorization
 * - Word boundary matching to avoid partial matches
 * - Multi-feature support (tasks can belong to multiple features)
 * - Fallback "Other" category for unmatched tasks
 */
import type { TaskWithAttemptStatus } from 'shared/types';

/**
 * Keyword mapping for automatic feature detection.
 * Each feature has an array of keywords that match tasks to that feature.
 * Keywords are matched case-insensitively against task title + description.
 *
 * Note: Keywords use word boundary matching to avoid partial matches.
 * E.g., "team" matches "team chat" but NOT "steam" or "teammates".
 */
export const FEATURE_KEYWORDS: Record<string, string[]> = {
  Teams: ['team', 'chat', 'invite', 'workspace', 'organization'],
  Projects: ['project', 'kanban', 'board', 'sprint', 'milestone'],
  Members: ['member', 'user', 'profile', 'assignee', 'lead', 'people'],
  Views: ['view', 'filter', 'sort', 'column', 'table', 'list'],
  Documents: ['document', 'file', 'upload', 'storage', 'drive', 'attachment'],
  Issues: ['issue', 'task', 'bug', 'fix', 'error', 'crash', 'broken'],
  Authentication: [
    'auth',
    'login',
    'clerk',
    'sign-in',
    'sign-out',
    'session',
    'token',
  ],
  Admin: ['admin', 'permission', 'role', 'configuration', 'access'],
  Settings: ['setting', 'config', 'preference', 'option'],
  API: ['api', 'endpoint', 'request', 'response', 'backend', 'server', 'route'],
  UI: [
    'ui',
    'component',
    'button',
    'dialog',
    'modal',
    'sidebar',
    'navbar',
    'layout',
  ],
  Database: ['database', 'db', 'sql', 'migration', 'query', 'schema'],
};

/**
 * Feature display colors for visual consistency.
 * Uses Tailwind color palette values.
 */
export const FEATURE_COLORS: Record<string, string> = {
  Teams: '#3b82f6', // blue-500
  Projects: '#8b5cf6', // violet-500
  Members: '#06b6d4', // cyan-500
  Views: '#10b981', // emerald-500
  Documents: '#f59e0b', // amber-500
  Issues: '#ef4444', // red-500
  Authentication: '#6366f1', // indigo-500
  Admin: '#ec4899', // pink-500
  Settings: '#6b7280', // gray-500
  API: '#14b8a6', // teal-500
  UI: '#a855f7', // purple-500
  Database: '#f97316', // orange-500
  Other: '#9ca3af', // gray-400
};

/**
 * Detect features from task title and optional description.
 * Uses word boundary matching for accurate keyword detection.
 *
 * @param title - Task title (required)
 * @param description - Task description (optional)
 * @returns Array of matched feature names (can be multiple), or ['Other'] if no matches
 *
 * @example
 * detectFeatures("Fix team chat bug") // Returns ['Teams', 'Issues']
 * detectFeatures("Random text") // Returns ['Other']
 * detectFeatures("TEAM CHAT") // Returns ['Teams'] (case-insensitive)
 */
export function detectFeatures(
  title: string,
  description?: string | null
): string[] {
  const text = `${title} ${description || ''}`.toLowerCase();
  const matches: string[] = [];

  for (const [feature, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    for (const keyword of keywords) {
      // Use word boundary matching to avoid partial matches
      // \b matches word boundaries (start/end of word)
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(text)) {
        matches.push(feature);
        break; // Found match for this feature, move to next
      }
    }
  }

  return matches.length > 0 ? matches : ['Other'];
}

/**
 * Escape special regex characters in keyword.
 * Necessary for keywords containing special characters like "-".
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Feature group structure for UI rendering.
 */
export interface FeatureGroup {
  /** Unique identifier (kebab-case feature name) */
  featureId: string;
  /** Display name of the feature */
  featureName: string;
  /** Color for visual indicator (hex color) */
  featureColor: string | null;
  /** Tasks belonging to this feature */
  tasks: TaskWithAttemptStatus[];
  /** Number of completed tasks */
  doneCount: number;
  /** Completion percentage (0-100) */
  percentage: number;
}

/**
 * Groups tasks by detected features.
 * Tasks with multiple matching features appear in multiple groups.
 * Tasks with no matches go into "Other" group.
 *
 * @param tasks - Array of tasks to group
 * @returns Array of FeatureGroup objects sorted by priority
 *
 * Sorting order:
 * 1. Active features (not 100% complete) first, sorted by percentage descending
 * 2. Completed features (100%) next
 * 3. "Other" category always last
 */
export function groupTasksByFeatures(
  tasks: TaskWithAttemptStatus[]
): FeatureGroup[] {
  const groupMap = new Map<string, FeatureGroup>();

  // Group tasks by detected features
  for (const task of tasks) {
    const features = detectFeatures(task.title, task.description);

    for (const featureName of features) {
      const existing = groupMap.get(featureName);
      if (existing) {
        existing.tasks.push(task);
      } else {
        groupMap.set(featureName, {
          featureId: featureName.toLowerCase().replace(/\s+/g, '-'),
          featureName,
          featureColor: FEATURE_COLORS[featureName] ?? null,
          tasks: [task],
          doneCount: 0,
          percentage: 0,
        });
      }
    }
  }

  // Calculate stats for each group
  const groups = Array.from(groupMap.values()).map((group) => {
    const doneCount = group.tasks.filter((t) => t.status === 'done').length;
    const percentage =
      group.tasks.length > 0
        ? Math.round((doneCount / group.tasks.length) * 100)
        : 0;
    return { ...group, doneCount, percentage };
  });

  // Sort groups: "Other" always last, then 100% complete at end,
  // then by percentage descending, then alphabetically
  groups.sort((a, b) => {
    // "Other" always at the bottom
    if (a.featureName === 'Other') return 1;
    if (b.featureName === 'Other') return -1;

    // Put 100% complete groups at the end (but before "Other")
    const aComplete = a.percentage === 100;
    const bComplete = b.percentage === 100;
    if (aComplete !== bComplete) return aComplete ? 1 : -1;

    // Sort by percentage descending (higher progress first)
    if (a.percentage !== b.percentage) return b.percentage - a.percentage;

    // Alphabetically by name
    return a.featureName.localeCompare(b.featureName);
  });

  return groups;
}
