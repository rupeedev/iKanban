/**
 * Global limit warning banner shown at the top of the app (IKA-185)
 * Displays the highest severity limit warning
 */
import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowUpRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useUsageLimits, type LimitSeverity } from '@/hooks/useUsageLimits';

const DISMISSED_KEY = 'limit-banner-dismissed';
const DISMISS_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

interface DismissedState {
  dismissedAt: number;
  severity: LimitSeverity;
}

const SEVERITY_STYLES: Record<
  Exclude<LimitSeverity, 'none'>,
  { bg: string; text: string; border: string }
> = {
  warning: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-700 dark:text-yellow-400',
    border: 'border-b border-yellow-500/30',
  },
  critical: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-b border-orange-500/30',
  },
  exceeded: {
    bg: 'bg-red-500/10',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-b border-red-500/30',
  },
};

function getSeverityPriority(severity: LimitSeverity): number {
  switch (severity) {
    case 'exceeded':
      return 3;
    case 'critical':
      return 2;
    case 'warning':
      return 1;
    default:
      return 0;
  }
}

export function GlobalLimitBanner() {
  const navigate = useNavigate();
  const { getResourcesAtLimit, getHighestSeverity, isLoading } =
    useUsageLimits();
  const [isDismissed, setIsDismissed] = useState(false);

  const highestSeverity = getHighestSeverity();
  const resourcesAtLimit = getResourcesAtLimit();

  // Check dismissed state on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DISMISSED_KEY);
      if (stored) {
        const state: DismissedState = JSON.parse(stored);
        const now = Date.now();
        // Only keep dismissed if within duration and severity hasn't increased
        if (
          now - state.dismissedAt < DISMISS_DURATION_MS &&
          getSeverityPriority(highestSeverity) <=
            getSeverityPriority(state.severity)
        ) {
          setIsDismissed(true);
        } else {
          sessionStorage.removeItem(DISMISSED_KEY);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [highestSeverity]);

  const handleDismiss = () => {
    setIsDismissed(true);
    const state: DismissedState = {
      dismissedAt: Date.now(),
      severity: highestSeverity,
    };
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(state));
  };

  // Don't show if loading, no warnings, or dismissed
  if (isLoading || highestSeverity === 'none' || isDismissed) {
    return null;
  }

  const styles = SEVERITY_STYLES[highestSeverity];

  // Build message based on resources at limit
  const resourceList = resourcesAtLimit
    .slice(0, 3)
    .map((r) => r.displayName.toLowerCase())
    .join(', ');

  const getMessage = () => {
    if (highestSeverity === 'exceeded') {
      return `Plan limit reached for ${resourceList}. Upgrade to continue.`;
    }
    if (highestSeverity === 'critical') {
      return `Approaching plan limits for ${resourceList}. Consider upgrading.`;
    }
    return `Usage at ${resourcesAtLimit[0]?.percentage}% for ${resourceList}.`;
  };

  return (
    <div className={cn('px-4 py-2', styles.bg, styles.border)}>
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={cn('h-4 w-4 flex-shrink-0', styles.text)} />
          <span className={cn('text-sm font-medium truncate', styles.text)}>
            {getMessage()}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant={highestSeverity === 'exceeded' ? 'default' : 'outline'}
            className="gap-1.5 h-7 px-2.5 text-xs"
            onClick={() => navigate('/settings/billing')}
          >
            Upgrade
            <ArrowUpRight className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
