import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface ListSkeletonProps {
  /** Number of skeleton items to display */
  count?: number;
  /** Height of each item */
  itemHeight?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ListSkeleton displays a loading placeholder for list views.
 */
export function ListSkeleton({
  count = 3,
  itemHeight = 'h-16',
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('w-full', itemHeight)} />
      ))}
    </div>
  );
}
