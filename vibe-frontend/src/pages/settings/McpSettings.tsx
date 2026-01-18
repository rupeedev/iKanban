import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { JSONEditor } from '@/components/ui/json-editor';
import { Loader2 } from 'lucide-react';
import type { BaseCodingAgent, ExecutorConfig } from 'shared/types';
import { McpConfig } from 'shared/types';
import { useUserSystem } from '@/components/ConfigProvider';
import { mcpServersApi } from '@/lib/api';
import { McpConfigStrategyGeneral } from '@/lib/mcpStrategies';
import { McpConfigSummary } from '@/components/settings/McpConfigSummary';
import { McpPreconfiguredServers } from '@/components/settings/McpPreconfiguredServers';

export function McpSettings() {
  const { t } = useTranslation('settings');
  const { config, profiles } = useUserSystem();
  const [mcpServers, setMcpServers] = useState('{}');
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ExecutorConfig | null>(
    null
  );
  const [mcpApplying, setMcpApplying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  const refreshSummary = useCallback(() => {
    setSummaryRefreshKey((prev) => prev + 1);
  }, []);

  // Initialize selected profile when config loads
  useEffect(() => {
    if (config?.executor_profile && profiles && !selectedProfile) {
      // Find the current profile
      const currentProfile = profiles[config.executor_profile.executor];
      if (currentProfile) {
        setSelectedProfile(currentProfile);
      } else if (Object.keys(profiles).length > 0) {
        // Default to first profile if current profile not found
        setSelectedProfile(Object.values(profiles)[0]);
      }
    }
  }, [config?.executor_profile, profiles, selectedProfile]);

  // Load existing MCP configuration when selected profile changes
  useEffect(() => {
    const loadMcpServersForProfile = async (profile: ExecutorConfig) => {
      // Reset state when loading
      setMcpLoading(true);
      setMcpError(null);

      try {
        // Load MCP servers for the selected profile/agent
        // Find the key for this profile
        const profileKey = profiles
          ? Object.keys(profiles).find((key) => profiles[key] === profile)
          : null;
        if (!profileKey) {
          throw new Error('Profile key not found');
        }

        const result = await mcpServersApi.load({
          executor: profileKey as BaseCodingAgent,
        });
        // Store the McpConfig from backend
        setMcpConfig(result.mcp_config);
        // Create the full configuration structure using the schema
        const fullConfig = McpConfigStrategyGeneral.createFullConfig(
          result.mcp_config
        );
        const configJson = JSON.stringify(fullConfig, null, 2);
        setMcpServers(configJson);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes('does not support MCP')
        ) {
          setMcpError(err.message);
        } else {
          console.error('Error loading MCP servers:', err);
        }
      } finally {
        setMcpLoading(false);
      }
    };

    // Load MCP servers for the selected profile
    if (selectedProfile) {
      loadMcpServersForProfile(selectedProfile);
    }
  }, [selectedProfile, profiles]);

  const handleMcpServersChange = (value: string) => {
    setMcpServers(value);
    setMcpError(null);

    // Validate JSON on change
    if (value.trim() && mcpConfig) {
      try {
        const parsedConfig = JSON.parse(value);
        // Validate using the schema path from backend
        McpConfigStrategyGeneral.validateFullConfig(mcpConfig, parsedConfig);
      } catch (err) {
        if (err instanceof SyntaxError) {
          setMcpError(t('settings.mcp.errors.invalidJson'));
        } else {
          setMcpError(
            err instanceof Error
              ? err.message
              : t('settings.mcp.errors.validationError')
          );
        }
      }
    }
  };

  const handleApplyMcpServers = async () => {
    if (!selectedProfile || !mcpConfig) return;

    setMcpApplying(true);
    setMcpError(null);

    try {
      // Validate and save MCP configuration
      if (mcpServers.trim()) {
        try {
          const fullConfig = JSON.parse(mcpServers);
          McpConfigStrategyGeneral.validateFullConfig(mcpConfig, fullConfig);
          const mcpServersConfig =
            McpConfigStrategyGeneral.extractServersForApi(
              mcpConfig,
              fullConfig
            );

          // Find the key for the selected profile
          const selectedProfileKey = profiles
            ? Object.keys(profiles).find(
                (key) => profiles[key] === selectedProfile
              )
            : null;
          if (!selectedProfileKey) {
            throw new Error('Selected profile key not found');
          }

          await mcpServersApi.save(
            {
              executor: selectedProfileKey as BaseCodingAgent,
            },
            { servers: mcpServersConfig }
          );

          // Show success feedback and refresh summary table
          setSuccess(true);
          refreshSummary();
          setTimeout(() => setSuccess(false), 3000);
        } catch (mcpErr) {
          if (mcpErr instanceof SyntaxError) {
            setMcpError(t('settings.mcp.errors.invalidJson'));
          } else {
            setMcpError(
              mcpErr instanceof Error
                ? mcpErr.message
                : t('settings.mcp.errors.saveFailed')
            );
          }
        }
      }
    } catch (err) {
      setMcpError(t('settings.mcp.errors.applyFailed'));
      console.error('Error applying MCP servers:', err);
    } finally {
      setMcpApplying(false);
    }
  };

  const addServer = (key: string) => {
    try {
      const existing = mcpServers.trim() ? JSON.parse(mcpServers) : {};
      const updated = McpConfigStrategyGeneral.addPreconfiguredToConfig(
        mcpConfig!,
        existing,
        key
      );
      setMcpServers(JSON.stringify(updated, null, 2));
      setMcpError(null);
    } catch (err) {
      console.error(err);
      setMcpError(
        err instanceof Error
          ? err.message
          : t('settings.mcp.errors.addServerFailed')
      );
    }
  };

  if (!config) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.mcp.errors.loadFailed')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MCP Configuration Summary - at the top */}
      <McpConfigSummary profiles={profiles} refreshKey={summaryRefreshKey} />

      {mcpError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('settings.mcp.errors.mcpError', { error: mcpError })}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.mcp.save.successMessage')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcp.title')}</CardTitle>
          <CardDescription>{t('settings.mcp.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-executor">
              {t('settings.mcp.labels.agent')}
            </Label>
            <Select
              value={
                selectedProfile
                  ? Object.keys(profiles || {}).find(
                      (key) => profiles![key] === selectedProfile
                    ) || ''
                  : ''
              }
              onValueChange={(value: string) => {
                const profile = profiles?.[value];
                if (profile) setSelectedProfile(profile);
              }}
            >
              <SelectTrigger id="mcp-executor">
                <SelectValue
                  placeholder={t('settings.mcp.labels.agentPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {profiles &&
                  Object.entries(profiles)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([profileKey]) => (
                      <SelectItem key={profileKey} value={profileKey}>
                        {profileKey}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.mcp.labels.agentHelper')}
            </p>
          </div>

          {mcpError && mcpError.includes('does not support MCP') ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {t('settings.mcp.errors.notSupported')}
                  </h3>
                  <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    <p>{mcpError}</p>
                    <p className="mt-1">
                      {t('settings.mcp.errors.supportMessage')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mcp-servers">
                {t('settings.mcp.labels.serverConfig')}
              </Label>
              <JSONEditor
                id="mcp-servers"
                placeholder={
                  mcpLoading
                    ? t('settings.mcp.save.loading')
                    : '{\n  "server-name": {\n    "type": "stdio",\n    "command": "your-command",\n    "args": ["arg1", "arg2"]\n  }\n}'
                }
                value={
                  mcpLoading ? t('settings.mcp.loading.jsonEditor') : mcpServers
                }
                onChange={handleMcpServersChange}
                disabled={mcpLoading}
                minHeight={300}
              />
              {mcpError && !mcpError.includes('does not support MCP') && (
                <p className="text-sm text-destructive dark:text-red-400">
                  {mcpError}
                </p>
              )}
              <div className="text-sm text-muted-foreground">
                {mcpLoading ? (
                  t('settings.mcp.loading.configuration')
                ) : (
                  <span>
                    {t('settings.mcp.labels.saveLocation')}
                    <span className="ml-2 font-mono text-xs">
                      {t('settings.mcp.labels.saveLocationWorkspace')}
                    </span>
                  </span>
                )}
              </div>

              {mcpConfig?.preconfigured &&
                typeof mcpConfig.preconfigured === 'object' && (
                  <McpPreconfiguredServers
                    mcpConfig={mcpConfig}
                    onAddServer={addServer}
                  />
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
        <div className="flex justify-end">
          <Button
            onClick={handleApplyMcpServers}
            disabled={mcpApplying || mcpLoading || !!mcpError || success}
          >
            {mcpApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {success && <span className="mr-2">✓</span>}
            {success
              ? t('settings.mcp.save.success')
              : t('settings.mcp.save.button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
