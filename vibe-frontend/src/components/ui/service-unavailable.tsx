import { ServerOff, RefreshCw } from 'lucide-react';
import { useConnectionSafe } from '@/contexts/ConnectionContext';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';

interface ServiceUnavailableProps {
  className?: string;
  /** Whether to show as an overlay (full screen) or inline */
  variant?: 'overlay' | 'inline' | 'banner';
}

/**
 * Display when the circuit breaker is open and the service is unavailable.
 * Shows a countdown timer until the next retry attempt.
 */
export function ServiceUnavailable({
  className,
  variant = 'banner',
}: ServiceUnavailableProps) {
  const { circuitState, timeUntilRetry, resetCircuit, isServiceAvailable } =
    useConnectionSafe();

  // Only show when circuit is open
  if (isServiceAvailable) {
    return null;
  }

  const formatTimeRemaining = () => {
    if (timeUntilRetry <= 0) return 'Retrying...';
    const seconds = Math.ceil(timeUntilRetry / 1000);
    return `Retrying in ${seconds}s`;
  };

  if (variant === 'overlay') {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          'bg-background/80 backdrop-blur-sm',
          className
        )}
        role="alert"
        aria-live="assertive"
        data-testid="service-unavailable-overlay"
      >
        <Card className="max-w-md mx-4 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <ServerOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Service Temporarily Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p>
              We're having trouble connecting to our servers. The system will
              automatically retry in a few moments.
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">
              {formatTimeRemaining()}
            </p>
          </CardContent>
          <CardFooter className="flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={resetCircuit}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <Card
        className={cn('border-orange-500/50', className)}
        role="alert"
        aria-live="polite"
        data-testid="service-unavailable-inline"
      >
        <CardContent className="flex items-center gap-4 py-4">
          <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <ServerOff className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Service Unavailable</p>
            <p className="text-sm text-muted-foreground">
              {formatTimeRemaining()}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetCircuit}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Banner variant (default)
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'px-4 py-3',
        'flex items-center justify-between gap-3',
        'text-sm font-medium',
        'shadow-md',
        'animate-in slide-in-from-top duration-300',
        'bg-orange-500/90 dark:bg-orange-600/90',
        'text-orange-950 dark:text-orange-50',
        className
      )}
      data-testid="service-unavailable-banner"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ServerOff className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">
          Service unavailable. {formatTimeRemaining()}
        </span>
        {circuitState === 'half-open' && (
          <span className="text-xs opacity-80 hidden sm:inline">
            (Testing connection...)
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={resetCircuit}
        className={cn(
          'h-7 px-2',
          'text-orange-950 dark:text-orange-50',
          'hover:bg-white/20'
        )}
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
        Retry Now
      </Button>
    </div>
  );
}
