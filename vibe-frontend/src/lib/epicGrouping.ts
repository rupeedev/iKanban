/**
 * Feature-based grouping utilities for the dashboard.
 * IKA-235: Visual hierarchy for feature → task relationships.
 *
 * This module provides:
 * - Feature detection from task titles using keywords
 * - Progress calculation at feature level
 * - Completion date tracking
 *
 * Note: Since tasks don't have explicit epic prefixes, we use feature
 * keywords as the primary grouping level (Authentication, Dashboard, etc.)
 */
import type { TaskWithAttemptStatus } from 'shared/types';
import { FEATURE_COLORS } from './featureDetection';

/**
 * Feature detection keywords.
 * Tasks are grouped by the first matching feature keyword.
 */
const FEATURE_KEYWORDS: Record<string, string[]> = {
  Setup: ['setup', 'init', 'bootstrap', 'scaffold', 'configure', 'install'],
  Authentication: [
    'auth',
    'login',
    'logout',
    'sign-in',
    'sign-out',
    'token',
    'session',
    'clerk',
    'oauth',
    'workspace switcher',
  ],
  Dashboard: [
    'dashboard',
    'overview',
    'summary',
    'metrics',
    'stats',
    'insights',
    'analytics',
  ],
  Forms: ['form', 'input', 'validation', 'submit', 'field', 'editor'],
  Lists: [
    'list',
    'table',
    'grid',
    'pagination',
    'filter',
    'sort',
    'kanban',
    'timeline',
  ],
  CRUD: [
    'create',
    'update',
    'delete',
    'add',
    'edit',
    'remove',
    'save',
    'modify',
  ],
  API: [
    'api',
    'endpoint',
    'request',
    'response',
    'fetch',
    'backend',
    'route',
    'server',
    '401',
    '404',
    '500',
  ],
  UI: [
    'ui',
    'component',
    'layout',
    'style',
    'design',
    'button',
    'modal',
    'dialog',
    'sidebar',
    'navbar',
    'icon',
    'theme',
    'responsive',
    'mobile',
  ],
  Testing: ['test', 'spec', 'e2e', 'unit', 'playwright', 'verification'],
  Documents: [
    'document',
    'file',
    'upload',
    'storage',
    'drive',
    'attachment',
    'folder',
  ],
  Projects: ['project', 'milestone', 'sprint', 'feature tree', 'progress'],
  Teams: ['team', 'member', 'invite', 'workspace', 'organization', 'people'],
  Settings: [
    'setting',
    'config',
    'preference',
    'option',
    'mcp',
    'agent config',
  ],
  Database: ['database', 'db', 'sql', 'migration', 'query', 'schema', 'sqlx'],
  Deployment: [
    'deploy',
    'railway',
    'docker',
    'ci',
    'cd',
    'github action',
    'build',
  ],
  Agent: ['agent', 'ai', 'llm', 'claude', 'copilot', 'gemini', 'executor'],
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
 * Detect feature from task title based on keywords.
 * Returns the first matching feature, or "Other" if no keywords match.
 */
function detectFeature(title: string, description?: string | null): string {
  const text = `${title} ${description || ''}`.toLowerCase();

  for (const [featureName, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(text)) {
        return featureName;
      }
    }
  }

  return 'Other';
}

/**
 * Escape special regex characters in keyword.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get completion date for a task (if done).
 */
function getCompletionDate(task: TaskWithAttemptStatus): Date | null {
  if (task.status !== 'done') return null;
  return task.updated_at ? new Date(task.updated_at) : null;
}

/**
 * Get health status for a feature based on its tasks.
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

  if (done === total) return 'completed';
  if (blocked > 0) return 'blocked';
  if (done / total < 0.3 && inProgress === 0) return 'at-risk';

  return 'on-track';
}

/**
 * Generate a color for a feature based on its name.
 */
function getFeatureColor(featureName: string): string {
  // Try to match with existing feature colors
  for (const [feature, color] of Object.entries(FEATURE_COLORS)) {
    if (
      featureName.toLowerCase().includes(feature.toLowerCase()) ||
      feature.toLowerCase().includes(featureName.toLowerCase())
    ) {
      return color;
    }
  }

  // Feature-specific colors
  const featureColors: Record<string, string> = {
    Setup: '#10b981', // emerald
    Authentication: '#6366f1', // indigo
    Dashboard: '#8b5cf6', // violet
    Forms: '#f59e0b', // amber
    Lists: '#06b6d4', // cyan
    CRUD: '#3b82f6', // blue
    API: '#14b8a6', // teal
    UI: '#a855f7', // purple
    Testing: '#84cc16', // lime
    Documents: '#f97316', // orange
    Projects: '#8b5cf6', // violet
    Teams: '#3b82f6', // blue
    Settings: '#6b7280', // gray
    Database: '#f97316', // orange
    Deployment: '#ec4899', // pink
    Agent: '#ef4444', // red
    Other: '#9ca3af', // gray-400
  };

  return featureColors[featureName] || '#9ca3af';
}

/**
 * Group tasks by feature.
 * Each feature becomes a top-level card (displayed as "epic" in the UI).
 * Tasks are listed directly under each feature (as a single "story").
 */
export function groupTasksByEpicAndStory(
  tasks: TaskWithAttemptStatus[]
): EpicGroup[] {
  const featureMap = new Map<string, TaskWithAttemptStatus[]>();

  // Group tasks by detected feature
  for (const task of tasks) {
    const featureName = detectFeature(task.title, task.description);

    if (!featureMap.has(featureName)) {
      featureMap.set(featureName, []);
    }
    featureMap.get(featureName)!.push(task);
  }

  // Build EpicGroup structures (each feature becomes an "epic")
  const epics: EpicGroup[] = [];

  for (const [featureName, featureTasks] of featureMap.entries()) {
    const doneCount = featureTasks.filter((t) => t.status === 'done').length;
    const totalCount = featureTasks.length;

    // Find earliest and latest dates
    let earliestDate: Date | null = null;
    let latestCompletionDate: Date | null = null;

    for (const task of featureTasks) {
      const taskDate = new Date(task.created_at);
      if (!earliestDate || taskDate < earliestDate) {
        earliestDate = taskDate;
      }

      const taskCompleted = getCompletionDate(task);
      if (
        taskCompleted &&
        (!latestCompletionDate || taskCompleted > latestCompletionDate)
      ) {
        latestCompletionDate = taskCompleted;
      }
    }

    // Create a single "story" containing all tasks for this feature
    // This maintains compatibility with the EpicProgressCard component
    const story: StoryGroup = {
      storyId: `${featureName}-tasks`.toLowerCase().replace(/\s+/g, '-'),
      storyName: 'Tasks',
      tasks: featureTasks,
      doneCount,
      totalCount,
      percentage:
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
      completedAt: doneCount === totalCount ? latestCompletionDate : null,
    };

    epics.push({
      epicId: featureName.toLowerCase().replace(/\s+/g, '-'),
      epicName: featureName,
      epicColor: getFeatureColor(featureName),
      stories: [story],
      totalTasks: totalCount,
      doneTasks: doneCount,
      percentage:
        totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
      healthStatus: getHealthStatus(featureTasks),
      startDate: earliestDate,
      completedAt: doneCount === totalCount ? latestCompletionDate : null,
    });
  }

  // Sort: active first, completed at end, Other always last
  epics.sort((a, b) => {
    if (a.epicName === 'Other') return 1;
    if (b.epicName === 'Other') return -1;
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
 * Calculate dashboard summary stats from feature groups.
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
