/**
 * Hook to handle usage limit errors and show upgrade modal (IKA-184)
 */
import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  UsageLimitExceededError,
  isUsageLimitError,
  getResourceDisplayName,
  getUsagePercentage,
} from '@/types/usageLimits';

export interface UsageLimitErrorState {
  isOpen: boolean;
  resource: string;
  resourceDisplayName: string;
  current: number;
  limit: number;
  percentage: number;
  upgradeUrl: string;
  message: string;
}

const initialState: UsageLimitErrorState = {
  isOpen: false,
  resource: '',
  resourceDisplayName: '',
  current: 0,
  limit: 0,
  percentage: 0,
  upgradeUrl: '',
  message: '',
};

/**
 * Hook to capture and display usage limit errors
 *
 * Usage:
 * ```tsx
 * const { usageLimitError, handleError, dismissError } = useUsageLimitError();
 *
 * const createTeam = async (data) => {
 *   try {
 *     await teamsApi.create(data);
 *   } catch (error) {
 *     if (handleError(error)) {
 *       return; // Error handled, modal will show
 *     }
 *     throw error; // Re-throw non-usage-limit errors
 *   }
 * };
 *
 * return (
 *   <>
 *     <LimitExceededModal {...usageLimitError} onClose={dismissError} />
 *   </>
 * );
 * ```
 */
export function useUsageLimitError() {
  const [usageLimitError, setUsageLimitError] =
    useState<UsageLimitErrorState>(initialState);

  /**
   * Try to handle an error as a usage limit error
   * Returns true if the error was a usage limit error and was handled
   */
  const handleError = useCallback((error: unknown): boolean => {
    // Check if it's an ApiError with status 429
    if (error instanceof ApiError && error.status === 429) {
      // Try to parse error_data as usage limit error
      if (error.error_data && isUsageLimitError(error.error_data)) {
        const data = error.error_data as UsageLimitExceededError;
        setUsageLimitError({
          isOpen: true,
          resource: data.resource,
          resourceDisplayName: getResourceDisplayName(data.resource),
          current: data.current,
          limit: data.limit,
          percentage: getUsagePercentage(data.current, data.limit),
          upgradeUrl: data.upgrade_url,
          message: data.message,
        });
        return true;
      }

      // Try to parse from error message if error_data not available
      try {
        const parsed = JSON.parse(error.message) as Record<string, unknown>;
        if (isUsageLimitError(parsed)) {
          const data = parsed as UsageLimitExceededError;
          setUsageLimitError({
            isOpen: true,
            resource: data.resource,
            resourceDisplayName: getResourceDisplayName(data.resource),
            current: data.current,
            limit: data.limit,
            percentage: getUsagePercentage(data.current, data.limit),
            upgradeUrl: data.upgrade_url,
            message: data.message,
          });
          return true;
        }
      } catch {
        // Not valid JSON, not a usage limit error
      }
    }

    return false;
  }, []);

  /**
   * Dismiss the error modal
   */
  const dismissError = useCallback(() => {
    setUsageLimitError(initialState);
  }, []);

  /**
   * Reset error state
   */
  const reset = useCallback(() => {
    setUsageLimitError(initialState);
  }, []);

  return {
    usageLimitError,
    handleError,
    dismissError,
    reset,
    isLimitExceeded: usageLimitError.isOpen,
  };
}
