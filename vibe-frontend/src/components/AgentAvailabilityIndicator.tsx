import { Check, AlertCircle, Loader2, Monitor, Cloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentAvailabilityState } from '@/hooks/useAgentAvailability';
import type { EnhancedAvailabilityInfo } from '@/hooks/useEnhancedAgentAvailability';
import { AgentModeBadge } from './AgentModeBadge';

interface AgentAvailabilityIndicatorProps {
  availability: AgentAvailabilityState;
  /** Enhanced availability info (optional, shows mode badge when provided) */
  enhancedInfo?: EnhancedAvailabilityInfo | null;
  /** Show compact mode with just the badge */
  compact?: boolean;
}

export function AgentAvailabilityIndicator({
  availability,
  enhancedInfo,
  compact = false,
}: AgentAvailabilityIndicatorProps) {
  const { t } = useTranslation('settings');

  // If enhanced info is provided and loaded, show enhanced view
  if (enhancedInfo && !enhancedInfo.isLoading) {
    if (compact) {
      return <AgentModeBadge mode={enhancedInfo.mode} />;
    }

    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <AgentModeBadge mode={enhancedInfo.mode} />
        </div>

        {/* CLI status detail */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Monitor className="h-3 w-3" />
          <span>
            {t('settings.agents.availability.cli')}:{' '}
            {enhancedInfo.cliAvailable ? (
              <span className="text-success">
                {enhancedInfo.cliStatus === 'login_detected'
                  ? t('settings.agents.availability.loginDetected')
                  : t('settings.agents.availability.installationFound')}
              </span>
            ) : (
              <span className="text-warning">
                {t('settings.agents.availability.notInstalled')}
              </span>
            )}
          </span>
        </div>

        {/* API status detail */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cloud className="h-3 w-3" />
          <span>
            {t('settings.agents.availability.api')}:{' '}
            {enhancedInfo.apiAvailable ? (
              <span className="text-success">
                {t('settings.agents.availability.keyConfigured')}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t('settings.agents.availability.noKey')}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  }

  // Loading state for enhanced info
  if (enhancedInfo?.isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">
          {t('settings.agents.availability.checking')}
        </span>
      </div>
    );
  }

  // Fall back to simple availability display
  if (!availability) return null;

  return (
    <div className="flex flex-col gap-1 text-sm">
      {availability.status === 'checking' && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {t('settings.agents.availability.checking')}
          </span>
        </div>
      )}
      {availability.status === 'login_detected' && (
        <>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            <span className="text-success">
              {t('settings.agents.availability.loginDetected')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {t('settings.agents.availability.loginDetectedTooltip')}
          </p>
        </>
      )}
      {availability.status === 'installation_found' && (
        <>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            <span className="text-success">
              {t('settings.agents.availability.installationFound')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {t('settings.agents.availability.installationFoundTooltip')}
          </p>
        </>
      )}
      {availability.status === 'not_found' && (
        <>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning" />
            <span className="text-warning">
              {t('settings.agents.availability.notFound')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {t('settings.agents.availability.notFoundTooltip')}
          </p>
        </>
      )}
    </div>
  );
}
