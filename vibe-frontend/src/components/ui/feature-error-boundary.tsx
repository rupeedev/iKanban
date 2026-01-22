import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FeatureErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Name of the feature for error logging and display */
  featureName: string;
  /** Custom fallback UI (overrides default error card) */
  fallback?: ReactNode;
  /** Callback when an error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Additional CSS classes for the fallback container */
  className?: string;
  /** data-testid for the error state */
  'data-testid'?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * FeatureErrorBoundary isolates errors to specific features/sections.
 *
 * When a child component throws, this boundary catches the error and:
 * 1. Logs to console with feature context
 * 2. Shows an error card with retry option
 * 3. Allows the rest of the app to continue working
 *
 * Usage:
 * ```tsx
 * <FeatureErrorBoundary featureName="Sidebar">
 *   <Sidebar />
 * </FeatureErrorBoundary>
 * ```
 */
export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  State
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { featureName, onError } = this.props;

    // Log to console in development
    console.error(`[${featureName}] Error:`, error);
    console.error('Component stack:', errorInfo.componentStack);

    // Call optional error callback
    onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const {
      children,
      featureName,
      fallback,
      className,
      'data-testid': testId,
    } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <Card
          className={cn(
            'border-destructive/50 bg-destructive/5 m-2',
            className
          )}
          data-testid={
            testId || `${featureName.toLowerCase().replace(/\s+/g, '-')}-error`
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
              {featureName} failed to load
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              This section encountered an error. Other parts of the app should
              still work.
            </p>
            {error?.message && (
              <p className="text-xs text-destructive/80 mb-3 font-mono bg-destructive/10 p-2 rounded">
                {error.message}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={this.handleReset}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                Try Again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={this.handleReload}
                className="h-7 text-xs"
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return children;
  }
}
