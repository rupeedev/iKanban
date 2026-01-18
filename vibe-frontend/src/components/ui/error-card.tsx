import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorCardProps {
  /** Error title to display */
  title?: string;
  /** Error message/description */
  message?: string;
  /** Callback for retry button */
  onRetry?: () => void;
  /** Visual variant of the error card */
  variant?: 'default' | 'inline' | 'minimal';
  /** Additional CSS classes */
  className?: string;
  /** data-testid for testing */
  'data-testid'?: string;
}

/**
 * ErrorCard displays error states with optional retry functionality.
 *
 * Variants:
 * - default: Full error card with icon, title, message, and retry button
 * - inline: Compact version for inline display
 * - minimal: Just the message with retry button
 */
export function ErrorCard({
  title = 'Something went wrong',
  message,
  onRetry,
  variant = 'default',
  className,
  'data-testid': testId,
}: ErrorCardProps) {
  if (variant === 'minimal') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-destructive',
          className
        )}
        data-testid={testId}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{message || title}</span>
        {onRetry && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRetry}
            className="h-7 px-2"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-md border border-destructive/50 bg-destructive/10',
          className
        )}
        data-testid={testId}
      >
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <span className="flex-1 text-sm text-destructive">
          {message || title}
        </span>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="h-7 gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <Alert variant="destructive" className={className} data-testid={testId}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      {message && <AlertDescription>{message}</AlertDescription>}
      {onRetry && (
        <div className="mt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}
    </Alert>
  );
}
