/**
 * Types for usage limit error responses (IKA-184)
 * Matches backend crates/remote/src/routes/error.rs usage_limit_error_response
 */

/**
 * Error response from backend when usage limit is exceeded (429)
 */
export interface UsageLimitExceededError {
  error: 'usage_limit_exceeded';
  message: string;
  resource: string;
  current: number;
  limit: number;
  upgrade_url: string;
}

/**
 * Check if an error is a usage limit exceeded error
 */
export function isUsageLimitError(
  error: unknown
): error is UsageLimitExceededError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const e = error as Record<string, unknown>;
  return (
    e.error === 'usage_limit_exceeded' &&
    typeof e.resource === 'string' &&
    typeof e.current === 'number' &&
    typeof e.limit === 'number'
  );
}

/**
 * Resource type to user-friendly display name
 */
export function getResourceDisplayName(resource: string): string {
  const names: Record<string, string> = {
    teams: 'Teams',
    projects: 'Projects',
    members: 'Team Members',
    tasks: 'Tasks',
    ai_requests: 'AI Requests',
    storage: 'Storage',
  };
  return names[resource] || resource;
}

/**
 * Get usage percentage for display
 */
export function getUsagePercentage(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}
