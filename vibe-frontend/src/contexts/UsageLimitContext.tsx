/**
 * Context for handling usage limit errors globally (IKA-184)
 *
 * Provides a global error handler that can be used to show the
 * limit exceeded modal from any mutation or API call.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useUsageLimitError } from '@/hooks/useUsageLimitError';
import { LimitExceededModal } from '@/components/common/LimitExceededModal';

interface UsageLimitContextValue {
  /**
   * Handle an error - returns true if it was a usage limit error
   * Use this in mutation error handlers
   */
  handleError: (error: unknown) => boolean;
  /**
   * Whether a limit error is currently being displayed
   */
  isLimitExceeded: boolean;
}

const UsageLimitContext = createContext<UsageLimitContextValue | null>(null);

export function UsageLimitProvider({ children }: { children: ReactNode }) {
  const { usageLimitError, handleError, dismissError, isLimitExceeded } =
    useUsageLimitError();

  return (
    <UsageLimitContext.Provider value={{ handleError, isLimitExceeded }}>
      {children}
      <LimitExceededModal {...usageLimitError} onClose={dismissError} />
    </UsageLimitContext.Provider>
  );
}

/**
 * Hook to access the usage limit context
 *
 * @example
 * ```tsx
 * const { handleError } = useUsageLimits();
 *
 * const mutation = useMutation({
 *   mutationFn: createTeam,
 *   onError: (error) => {
 *     if (handleError(error)) return; // Handled - modal shown
 *     toast.error('Failed to create team');
 *   },
 * });
 * ```
 */
export function useUsageLimits(): UsageLimitContextValue {
  const context = useContext(UsageLimitContext);
  if (!context) {
    throw new Error('useUsageLimits must be used within UsageLimitProvider');
  }
  return context;
}
