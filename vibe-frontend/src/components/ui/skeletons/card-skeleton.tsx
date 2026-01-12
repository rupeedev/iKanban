import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface CardSkeletonProps {
  /** Show title skeleton */
  showTitle?: boolean;
  /** Show description skeleton */
  showDescription?: boolean;
  /** Show action button skeleton */
  showAction?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CardSkeleton displays a loading placeholder for card components.
 */
export function CardSkeleton({
  showTitle = true,
  showDescription = true,
  showAction = false,
  className,
}: CardSkeletonProps) {
  return (
    <div className={cn('p-4 border rounded-lg space-y-3', className)}>
      {showTitle && <Skeleton className="h-5 w-1/3" />}
      {showDescription && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
      {showAction && <Skeleton className="h-8 w-24" />}
    </div>
  );
}

export interface CardGridSkeletonProps {
  /** Number of cards to display */
  count?: number;
  /** Number of columns (responsive) */
  columns?: 1 | 2 | 3 | 4;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CardGridSkeleton displays a loading placeholder for card grids.
 */
export function CardGridSkeleton({
  count = 6,
  columns = 2,
  className,
}: CardGridSkeletonProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
