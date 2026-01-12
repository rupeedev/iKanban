import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Icon to display */
  icon?: React.ElementType;
  /** Title text */
  title?: string;
  /** Description message */
  message?: string;
  /** Optional action button or link */
  action?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** data-testid for testing */
  'data-testid'?: string;
}

/**
 * EmptyState displays a placeholder when there is no data to show.
 *
 * Used by QueryWrapper when data is empty/null, and can be used
 * directly in components for custom empty states.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'No data',
  message = 'There is nothing here yet',
  action,
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      data-testid={testId}
    >
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
