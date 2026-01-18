import { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorCard } from '@/components/ui/error-card';
import { EmptyState } from '@/components/ui/empty-state';

export interface QueryWrapperProps<T> {
  /** The query result from useQuery */
  query: UseQueryResult<T>;
  /** Render function that receives the data when available */
  children: (data: T) => ReactNode;
  /** Custom loading skeleton (default: simple skeleton) */
  skeleton?: ReactNode;
  /** Title for error state */
  errorTitle?: string;
  /** Message for empty state */
  emptyMessage?: string;
  /** Custom empty state title */
  emptyTitle?: string;
  /** Custom function to check if data is empty */
  isEmpty?: (data: T) => boolean;
  /** data-testid prefix for testing */
  'data-testid'?: string;
}

/**
 * Default function to check if data is considered "empty"
 */
function defaultIsEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

/**
 * QueryWrapper standardizes loading, error, and empty state handling.
 *
 * This component wraps useQuery results and ensures:
 * 1. Loading state shows a skeleton
 * 2. Error state shows an ErrorCard with retry
 * 3. Empty data shows an EmptyState
 * 4. Valid data is passed to children with correct type
 *
 * Usage:
 * ```tsx
 * function ProjectList() {
 *   const query = useProjects();
 *   return (
 *     <QueryWrapper
 *       query={query}
 *       skeleton={<ProjectListSkeleton />}
 *       errorTitle="Failed to load projects"
 *       emptyMessage="No projects yet"
 *     >
 *       {(projects) => projects.map(p => <ProjectCard project={p} />)}
 *     </QueryWrapper>
 *   );
 * }
 * ```
 */
export function QueryWrapper<T>({
  query,
  children,
  skeleton = <Skeleton className="h-32 w-full" />,
  errorTitle = 'Failed to load',
  emptyMessage = 'No data available',
  emptyTitle = 'No data',
  isEmpty = defaultIsEmpty,
  'data-testid': testId,
}: QueryWrapperProps<T>): ReactNode {
  const { data, isPending, isError, error, refetch } = query;

  // Loading state
  if (isPending) {
    return (
      <div data-testid={testId ? `${testId}-loading` : undefined}>
        {skeleton}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <ErrorCard
        title={errorTitle}
        message={
          error instanceof Error ? error.message : 'An unknown error occurred'
        }
        onRetry={() => refetch()}
        data-testid={testId ? `${testId}-error` : undefined}
      />
    );
  }

  // Empty state - check before rendering children
  if (data === undefined || data === null || isEmpty(data)) {
    return (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        data-testid={testId ? `${testId}-empty` : undefined}
      />
    );
  }

  // Success state - render children with typed data
  return <>{children(data)}</>;
}
