/**
 * Inline upgrade hint for action buttons (IKA-185)
 * Shows subtle hints near create buttons when approaching limits
 */
import { AlertTriangle, TrendingUp, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUsageLimits, type LimitResource } from '@/hooks/useUsageLimits';

interface InlineUpgradeHintProps {
  resource: LimitResource;
  className?: string;
}

/**
 * Small inline indicator shown next to buttons when approaching limits
 */
export function InlineUpgradeHint({
  resource,
  className,
}: InlineUpgradeHintProps) {
  const { getLimitStatus } = useUsageLimits();
  const status = getLimitStatus(resource);

  if (status.severity === 'none' || status.isUnlimited) {
    return null;
  }

  const Icon = status.severity === 'exceeded' ? Lock : AlertTriangle;
  const iconColor =
    status.severity === 'exceeded'
      ? 'text-red-500'
      : status.severity === 'critical'
        ? 'text-orange-500'
        : 'text-yellow-500';

  const tooltipMessage =
    status.severity === 'exceeded'
      ? `${status.displayName} limit reached. Upgrade to create more.`
      : `${status.percentage}% of ${status.displayName.toLowerCase()} limit used.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center', className)}>
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="text-xs">{tooltipMessage}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Text hint shown below input fields or buttons
 */
interface ResourceUpgradeHintProps {
  resource: LimitResource;
  className?: string;
}

export function ResourceUpgradeHint({
  resource,
  className,
}: ResourceUpgradeHintProps) {
  const { getLimitStatus } = useUsageLimits();
  const status = getLimitStatus(resource);

  if (status.severity === 'none' || status.isUnlimited) {
    return null;
  }

  const textColor =
    status.severity === 'exceeded'
      ? 'text-red-600 dark:text-red-400'
      : status.severity === 'critical'
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-yellow-600 dark:text-yellow-400';

  return (
    <div
      className={cn('flex items-center gap-1.5 text-xs', textColor, className)}
    >
      <TrendingUp className="h-3 w-3" />
      <span>
        {status.current}/{status.limit} {status.displayName.toLowerCase()} used
        ({status.percentage}%)
      </span>
    </div>
  );
}

/**
 * Pre-action check component that shows warning before user tries to create
 */
interface PreActionLimitCheckProps {
  resource: LimitResource;
  children: React.ReactNode;
  className?: string;
}

export function PreActionLimitCheck({
  resource,
  children,
  className,
}: PreActionLimitCheckProps) {
  const { getLimitStatus, wouldExceedLimit, recommendedPlan } =
    useUsageLimits();
  const status = getLimitStatus(resource);
  const willExceed = wouldExceedLimit(resource);

  // No warning needed
  if (status.severity === 'none' || status.isUnlimited) {
    return <>{children}</>;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {children}
      <div
        className={cn(
          'rounded-md px-3 py-2 text-xs',
          status.severity === 'exceeded'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400'
            : status.severity === 'critical'
              ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
              : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
        )}
      >
        <div className="flex items-center gap-2">
          {willExceed ? (
            <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span>
            {willExceed
              ? `Cannot create more ${status.displayName.toLowerCase()}. Limit reached.`
              : `${status.percentage}% of ${status.displayName.toLowerCase()} limit used.`}
            {recommendedPlan && !willExceed && (
              <span className="ml-1">
                Upgrade to {recommendedPlan.plan_name} for more.
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
