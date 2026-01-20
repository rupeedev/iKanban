/**
 * Warning banner for usage limits approaching threshold (IKA-185)
 * Shows at 80% (warning), 90% (critical), and 100% (exceeded)
 */
import { AlertTriangle, ArrowUpRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type {
  LimitSeverity,
  ResourceLimitStatus,
} from '@/hooks/useUsageLimits';

interface LimitWarningBannerProps {
  status: ResourceLimitStatus;
  onDismiss?: () => void;
  showUpgradeButton?: boolean;
  className?: string;
}

const SEVERITY_STYLES: Record<
  LimitSeverity,
  { bg: string; border: string; text: string; icon: string; progress: string }
> = {
  none: {
    bg: 'bg-muted/50',
    border: 'border-muted',
    text: 'text-muted-foreground',
    icon: 'text-muted-foreground',
    progress: 'bg-muted-foreground',
  },
  warning: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-700 dark:text-yellow-400',
    icon: 'text-yellow-500',
    progress: '[&>div]:bg-yellow-500',
  },
  critical: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-700 dark:text-orange-400',
    icon: 'text-orange-500',
    progress: '[&>div]:bg-orange-500',
  },
  exceeded: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-700 dark:text-red-400',
    icon: 'text-red-500',
    progress: '[&>div]:bg-red-500',
  },
};

function getSeverityMessage(
  severity: LimitSeverity,
  displayName: string,
  percentage: number
): string {
  switch (severity) {
    case 'exceeded':
      return `You've reached the ${displayName.toLowerCase()} limit for your plan.`;
    case 'critical':
      return `You're at ${percentage}% of your ${displayName.toLowerCase()} limit.`;
    case 'warning':
      return `You're approaching your ${displayName.toLowerCase()} limit (${percentage}%).`;
    default:
      return '';
  }
}

export function LimitWarningBanner({
  status,
  onDismiss,
  showUpgradeButton = true,
  className,
}: LimitWarningBannerProps) {
  const navigate = useNavigate();
  const styles = SEVERITY_STYLES[status.severity];

  if (status.severity === 'none' || status.isUnlimited) {
    return null;
  }

  const message = getSeverityMessage(
    status.severity,
    status.displayName,
    status.percentage
  );

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn('h-5 w-5 flex-shrink-0 mt-0.5', styles.icon)}
        />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm font-medium', styles.text)}>{message}</p>
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-2 -mt-1"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {status.current} / {status.limit}{' '}
                {status.displayName.toLowerCase()}
              </span>
              <span>{status.percentage}%</span>
            </div>
            <Progress
              value={status.percentage}
              className={cn('h-1.5', styles.progress)}
            />
          </div>

          {showUpgradeButton && (
            <Button
              size="sm"
              variant={status.severity === 'exceeded' ? 'default' : 'outline'}
              className="gap-1.5"
              onClick={() => navigate('/settings/billing')}
            >
              Upgrade Plan
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for use in smaller spaces (e.g., sidebars)
 */
interface CompactLimitBannerProps {
  status: ResourceLimitStatus;
  onClick?: () => void;
  className?: string;
}

export function CompactLimitBanner({
  status,
  onClick,
  className,
}: CompactLimitBannerProps) {
  const styles = SEVERITY_STYLES[status.severity];

  if (status.severity === 'none' || status.isUnlimited) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-md border px-3 py-2 text-left transition-colors hover:opacity-80',
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn('h-4 w-4 flex-shrink-0', styles.icon)} />
        <span className={cn('text-xs font-medium truncate', styles.text)}>
          {status.displayName}: {status.percentage}%
        </span>
      </div>
    </button>
  );
}
