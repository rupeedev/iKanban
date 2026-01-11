import { useEffect, useState, useMemo } from 'react';
import { BaseCodingAgent } from 'shared/types';
import { configApi, aiProviderKeysApi, AiProviderKeyInfo } from '../lib/api';
import type { AvailabilityMode } from '@/components/AgentModeBadge';

export type CliStatus = 'login_detected' | 'installation_found' | 'not_found';

export interface EnhancedAvailabilityInfo {
  cliAvailable: boolean;
  apiAvailable: boolean;
  mode: AvailabilityMode;
  cliStatus: CliStatus;
  lastAuthTimestamp?: number;
  isLoading: boolean;
}

// Map agents to their API providers
const AGENT_TO_PROVIDER: Record<string, string | null> = {
  CLAUDE_CODE: 'anthropic',
  CODEX: 'openai',
  GEMINI: 'google',
  AMP: 'anthropic',
  OPENCODE: 'openai',
  DROID: 'anthropic',
  QWEN_CODE: null, // Uses Qwen's own API
  CURSOR_AGENT: null, // CLI only
  COPILOT: null, // GitHub-specific auth
};

/**
 * Hook to check enhanced agent availability
 * Combines CLI availability (from local server) with API key status (from remote server)
 */
export function useEnhancedAgentAvailability(
  agent: BaseCodingAgent | null | undefined
): EnhancedAvailabilityInfo | null {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [lastAuthTimestamp, setLastAuthTimestamp] = useState<number | undefined>(
    undefined
  );
  const [providerKeys, setProviderKeys] = useState<AiProviderKeyInfo[]>([]);
  const [isLoadingCli, setIsLoadingCli] = useState(false);
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  // Check CLI availability
  useEffect(() => {
    if (!agent) {
      setCliStatus(null);
      setLastAuthTimestamp(undefined);
      return;
    }

    const checkCliAvailability = async () => {
      setIsLoadingCli(true);
      try {
        const info = await configApi.checkAgentAvailability(agent);
        switch (info.type) {
          case 'LOGIN_DETECTED':
            setCliStatus('login_detected');
            setLastAuthTimestamp(Number(info.last_auth_timestamp));
            break;
          case 'INSTALLATION_FOUND':
            setCliStatus('installation_found');
            setLastAuthTimestamp(undefined);
            break;
          case 'NOT_FOUND':
            setCliStatus('not_found');
            setLastAuthTimestamp(undefined);
            break;
        }
      } catch (error) {
        console.error('Failed to check CLI availability:', error);
        setCliStatus('not_found');
      } finally {
        setIsLoadingCli(false);
      }
    };

    checkCliAvailability();
  }, [agent]);

  // Load API provider keys
  useEffect(() => {
    const loadProviderKeys = async () => {
      setIsLoadingApi(true);
      try {
        const keys = await aiProviderKeysApi.list();
        setProviderKeys(keys);
      } catch (error) {
        console.error('Failed to load provider keys:', error);
        setProviderKeys([]);
      } finally {
        setIsLoadingApi(false);
      }
    };

    loadProviderKeys();
  }, []);

  // Compute enhanced availability
  const enhancedInfo = useMemo((): EnhancedAvailabilityInfo | null => {
    if (!agent || cliStatus === null) {
      return null;
    }

    const cliAvailable =
      cliStatus === 'login_detected' || cliStatus === 'installation_found';

    // Check if this agent has a corresponding API provider
    const provider = AGENT_TO_PROVIDER[agent];
    const apiAvailable = provider
      ? providerKeys.some(
          (key) => key.provider === provider && key.is_valid !== false
        )
      : false;

    // Determine mode
    let mode: AvailabilityMode;
    if (cliAvailable && apiAvailable) {
      mode = 'both';
    } else if (cliAvailable) {
      mode = 'cli_only';
    } else if (apiAvailable) {
      mode = 'api_only';
    } else {
      mode = 'none';
    }

    return {
      cliAvailable,
      apiAvailable,
      mode,
      cliStatus,
      lastAuthTimestamp,
      isLoading: isLoadingCli || isLoadingApi,
    };
  }, [agent, cliStatus, providerKeys, lastAuthTimestamp, isLoadingCli, isLoadingApi]);

  return enhancedInfo;
}

/**
 * Get the API provider for an agent
 */
export function getAgentApiProvider(agent: BaseCodingAgent): string | null {
  return AGENT_TO_PROVIDER[agent] || null;
}
