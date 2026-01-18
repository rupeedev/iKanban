/**
 * Utility functions for persisting panel sizes to localStorage.
 * Used by resizable panel layouts.
 */

export const PANEL_STORAGE_KEYS = {
  TEAM_ISSUES_PANEL: 'teamIssues.issuePanelSize',
  // Add other panel keys here as needed
} as const;

export const PANEL_DEFAULTS = {
  ISSUE_PANEL_SIZE: 35,
  ISSUE_PANEL_MIN: 25,
  ISSUE_PANEL_MAX: 60,
} as const;

/**
 * Load a panel size from localStorage.
 * Returns the saved size or default if not found/invalid.
 */
export function loadPanelSize(
  key: string,
  defaultSize: number,
  minSize: number,
  maxSize: number
): number {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const size = parseInt(saved, 10);
      if (!isNaN(size) && size >= minSize && size <= maxSize) {
        return size;
      }
    }
  } catch {
    // Ignore storage errors (e.g., private browsing mode)
  }
  return defaultSize;
}

/**
 * Save a panel size to localStorage.
 */
export function savePanelSize(key: string, size: number): void {
  try {
    localStorage.setItem(key, String(Math.round(size)));
  } catch {
    // Ignore storage errors (e.g., private browsing mode)
  }
}

/**
 * Load issue panel size specifically.
 */
export function loadIssuePanelSize(): number {
  return loadPanelSize(
    PANEL_STORAGE_KEYS.TEAM_ISSUES_PANEL,
    PANEL_DEFAULTS.ISSUE_PANEL_SIZE,
    PANEL_DEFAULTS.ISSUE_PANEL_MIN,
    PANEL_DEFAULTS.ISSUE_PANEL_MAX
  );
}

/**
 * Save issue panel size specifically.
 */
export function saveIssuePanelSize(size: number): void {
  savePanelSize(PANEL_STORAGE_KEYS.TEAM_ISSUES_PANEL, size);
}
