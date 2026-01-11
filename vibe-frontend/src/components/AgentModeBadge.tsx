import { Badge } from '@/components/ui/badge';
import { Monitor, Cloud, RefreshCw, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

export type AvailabilityMode = 'cli_only' | 'api_only' | 'both' | 'none';

interface AgentModeBadgeProps {
  mode: AvailabilityMode;
  className?: string;
  showTooltip?: boolean;
}

const MODE_CONFIG = {
  cli_only: {
    icon: Monitor,
    labelKey: 'settings.agents.mode.cliOnly',
    descriptionKey: 'settings.agents.mode.cliOnlyDescription',
    variant: 'secondary' as const,
  },
  api_only: {
    icon: Cloud,
    labelKey: 'settings.agents.mode.apiOnly',
    descriptionKey: 'settings.agents.mode.apiOnlyDescription',
    variant: 'default' as const,
  },
  both: {
    icon: RefreshCw,
    labelKey: 'settings.agents.mode.both',
    descriptionKey: 'settings.agents.mode.bothDescription',
    variant: 'outline' as const,
  },
  none: {
    icon: XCircle,
    labelKey: 'settings.agents.mode.none',
    descriptionKey: 'settings.agents.mode.noneDescription',
    variant: 'destructive' as const,
  },
} as const;

export function AgentModeBadge({
  mode,
  className,
  showTooltip = true,
}: AgentModeBadgeProps) {
  const { t } = useTranslation('settings');
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant={config.variant}
      className={`gap-1 ${mode === 'both' ? 'border-green-500 text-green-600 dark:text-green-400' : ''} ${className || ''}`}
    >
      <Icon className="h-3 w-3" />
      {t(config.labelKey)}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{t(config.descriptionKey)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
