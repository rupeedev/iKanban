import { useEffect, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { JSONEditor } from '@/components/ui/json-editor';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table/table';
import { Loader2, Eye, EyeOff, RefreshCw, Database, FileText } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

import { ExecutorConfigForm } from '@/components/ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/ConfigProvider';
import { CreateConfigurationDialog } from '@/components/dialogs/settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from '@/components/dialogs/settings/DeleteConfigurationDialog';
import { agentConfigsApi } from '@/lib/api';
import type { BaseCodingAgent, ExecutorConfigs } from 'shared/types';

type ExecutorsMap = Record<string, Record<string, Record<string, unknown>>>;
type VisibilityMap = Record<string, boolean>;

interface ConfigSummaryRow {
  agent: string;
  variant: string;
  model: string;
  keySettings: string;
}

// Check if an agent is visible (default is true if not specified)
function isAgentVisible(
  visibility: VisibilityMap | undefined,
  agentName: string
): boolean {
  if (!visibility) return true;
  return visibility[agentName] !== false;
}

// Extract key settings from a configuration object (excluding model and append_prompt)
function extractKeySettings(config: Record<string, unknown>): string {
  const settings: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    // Skip model and append_prompt as they have dedicated columns
    if (key === 'model' || key === 'append_prompt') continue;
    // Skip null/undefined values
    if (value === null || value === undefined) continue;
    // Format the setting
    if (typeof value === 'boolean') {
      settings.push(`${key}: ${value}`);
    } else if (typeof value === 'string' && value) {
      settings.push(`${key}: "${value}"`);
    } else if (typeof value === 'object') {
      settings.push(`${key}: {...}`);
    }
  }
  return settings.length > 0 ? settings.join(', ') : '-';
}

// Build summary rows from executor profiles (filtered by visibility)
function buildConfigSummary(
  executors: ExecutorsMap,
  visibility?: VisibilityMap
): ConfigSummaryRow[] {
  const rows: ConfigSummaryRow[] = [];

  for (const [agentName, variants] of Object.entries(executors)) {
    // Skip hidden agents
    if (!isAgentVisible(visibility, agentName)) continue;

    let isFirstVariant = true;
    for (const [variantName, configWrapper] of Object.entries(variants)) {
      // configWrapper is like { "COPILOT": { ...settings... } }
      const innerConfig = configWrapper[agentName] as
        | Record<string, unknown>
        | undefined;
      if (!innerConfig) continue;

      const model =
        typeof innerConfig.model === 'string' ? innerConfig.model : '(default)';
      const keySettings = extractKeySettings(innerConfig);

      rows.push({
        agent: isFirstVariant ? agentName : '',
        variant: variantName,
        model,
        keySettings,
      });
      isFirstVariant = false;
    }
  }

  return rows;
}

// Validation result type
type ValidationResult =
  | { valid: true; parsed: ExecutorConfigs }
  | { valid: false; error: string };

// Validate executor profiles structure
function validateExecutorProfiles(
  content: unknown,
  t: (key: string, options?: { defaultValue: string }) => string
): ValidationResult {
  if (
    !content ||
    typeof content !== 'object' ||
    !('executors' in (content as object))
  ) {
    return {
      valid: false,
      error: t('settings.agents.errors.missingExecutors', {
        defaultValue:
          'Invalid format: JSON must have an "executors" object at the root level. Expected structure: { "executors": { "CLAUDE_CODE": { ... }, "COPILOT": { ... } } }',
      }),
    };
  }
  const typed = content as { executors: unknown };
  if (typeof typed.executors !== 'object' || typed.executors === null) {
    return {
      valid: false,
      error: t('settings.agents.errors.invalidExecutors', {
        defaultValue:
          '"executors" must be an object containing executor configurations.',
      }),
    };
  }
  return { valid: true, parsed: content as ExecutorConfigs };
}

export function AgentSettings() {
  const { t } = useTranslation(['settings', 'common']);
  // Use profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    profilesPath,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

  const { reloadSystem } = useUserSystem();

  // Local editor state (draft that may differ from server)
  const [localProfilesContent, setLocalProfilesContent] = useState('');
  const [profilesSuccess, setProfilesSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form-based editor state
  const [useFormEditor, setUseFormEditor] = useState(true);
  const [selectedExecutorType, setSelectedExecutorType] =
    useState<BaseCodingAgent>('CLAUDE_CODE' as BaseCodingAgent);
  const [selectedConfiguration, setSelectedConfiguration] =
    useState<string>('DEFAULT');
  const [localParsedProfiles, setLocalParsedProfiles] =
    useState<ExecutorConfigs | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showHiddenAgents, setShowHiddenAgents] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Sync server state to local state when not dirty
  useEffect(() => {
    if (!isDirty && serverProfilesContent) {
      setLocalProfilesContent(serverProfilesContent);
      // Parse JSON inside effect to avoid object dependency
      try {
        const parsed = JSON.parse(serverProfilesContent);
        setLocalParsedProfiles(parsed);
      } catch (err) {
        console.error('Failed to parse profiles JSON:', err);
        setLocalParsedProfiles(null);
      }
    }
  }, [serverProfilesContent, isDirty]);

  // Sync raw profiles with parsed profiles
  const syncRawProfiles = (profiles: unknown) => {
    setLocalProfilesContent(JSON.stringify(profiles, null, 2));
  };

  // Mark profiles as dirty
  const markDirty = (nextProfiles: unknown) => {
    setLocalParsedProfiles(nextProfiles as ExecutorConfigs);
    syncRawProfiles(nextProfiles);
    setIsDirty(true);
  };

  // Open create dialog
  const openCreateDialog = async () => {
    try {
      const result = await CreateConfigurationDialog.show({
        executorType: selectedExecutorType,
        existingConfigs: Object.keys(
          localParsedProfiles?.executors?.[selectedExecutorType] || {}
        ),
      });

      if (result.action === 'created' && result.configName) {
        createConfiguration(
          selectedExecutorType,
          result.configName,
          result.cloneFrom
        );
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Create new configuration
  const createConfiguration = (
    executorType: string,
    configName: string,
    baseConfig?: string | null
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[executorType]
        ? executorsMap[executorType][baseConfig][executorType]
        : {};

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configName]: {
            [executorType]: base,
          },
        },
      },
    };

    markDirty(updatedProfiles);
    setSelectedConfiguration(configName);
  };

  // Open delete dialog
  const openDeleteDialog = async (configName: string) => {
    try {
      const result = await DeleteConfigurationDialog.show({
        configName,
        executorType: selectedExecutorType,
      });

      if (result === 'deleted') {
        await handleDeleteConfiguration(configName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Handle delete configuration
  const handleDeleteConfiguration = async (configToDelete: string) => {
    if (!localParsedProfiles) {
      return;
    }

    // Clear any previous errors
    setSaveError(null);

    try {
      // Validate that the configuration exists
      if (
        !localParsedProfiles.executors[selectedExecutorType]?.[configToDelete]
      ) {
        return;
      }

      // Check if this is the last configuration
      const currentConfigs = Object.keys(
        localParsedProfiles.executors[selectedExecutorType] || {}
      );
      if (currentConfigs.length <= 1) {
        return;
      }

      // Remove the configuration from the executor
      const remainingConfigs = {
        ...localParsedProfiles.executors[selectedExecutorType],
      };
      delete remainingConfigs[configToDelete];

      const updatedProfiles = {
        ...localParsedProfiles,
        executors: {
          ...localParsedProfiles.executors,
          [selectedExecutorType]: remainingConfigs,
        },
      };

      const executorsMap = updatedProfiles.executors as unknown as ExecutorsMap;
      // If no configurations left, create a blank DEFAULT (should not happen due to check above)
      if (Object.keys(remainingConfigs).length === 0) {
        executorsMap[selectedExecutorType] = {
          DEFAULT: { [selectedExecutorType]: {} },
        };
      }

      try {
        // Save using hook
        await saveProfiles(JSON.stringify(updatedProfiles, null, 2));

        // Update local state and reset dirty flag
        setLocalParsedProfiles(updatedProfiles);
        setLocalProfilesContent(JSON.stringify(updatedProfiles, null, 2));
        setIsDirty(false);

        // Select the next available configuration
        const nextConfigs = Object.keys(
          executorsMap[selectedExecutorType] || {}
        );
        const nextSelected = nextConfigs[0] || 'DEFAULT';
        setSelectedConfiguration(nextSelected);

        // Show success
        setProfilesSuccess(true);
        setTimeout(() => setProfilesSuccess(false), 3000);

        // Refresh global system so deleted configs are removed elsewhere
        reloadSystem();
      } catch (saveError: unknown) {
        console.error('Failed to save deletion to backend:', saveError);
        // Show actual API error message if available
        const errorMessage =
          saveError instanceof Error
            ? saveError.message
            : t('settings.agents.errors.deleteFailed');
        setSaveError(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
    }
  };

  const handleProfilesChange = (value: string) => {
    setLocalProfilesContent(value);
    setIsDirty(true);
    setSaveError(null);

    // Validate JSON on change
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        const validation = validateExecutorProfiles(parsed, t);
        if (validation.valid) {
          setLocalParsedProfiles(validation.parsed);
        } else {
          setSaveError(validation.error);
          setLocalParsedProfiles(null);
        }
      } catch {
        // Invalid JSON syntax
        setSaveError(
          t('settings.agents.errors.invalidJSON', {
            defaultValue:
              'Invalid JSON syntax. Please check your configuration.',
          })
        );
        setLocalParsedProfiles(null);
      }
    }
  };

  const handleSaveProfiles = async () => {
    // Clear any previous errors
    setSaveError(null);

    try {
      const contentToSave =
        useFormEditor && localParsedProfiles
          ? JSON.stringify(localParsedProfiles, null, 2)
          : localProfilesContent;

      // Validate structure before saving
      let toValidate: unknown;
      if (useFormEditor) {
        toValidate = localParsedProfiles;
      } else {
        try {
          toValidate = JSON.parse(localProfilesContent);
        } catch {
          setSaveError(
            t('settings.agents.errors.invalidJSON', {
              defaultValue:
                'Invalid JSON syntax. Please check your configuration.',
            })
          );
          return;
        }
      }

      const validation = validateExecutorProfiles(toValidate, t);
      if (!validation.valid) {
        setSaveError(validation.error);
        return;
      }

      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the local content if using form editor
      if (useFormEditor && localParsedProfiles) {
        setLocalProfilesContent(contentToSave);
      }

      // Refresh global system so new profiles are available elsewhere
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      // Show actual API error message if available
      const errorMessage =
        err instanceof Error
          ? err.message
          : t('settings.agents.errors.saveFailed');
      setSaveError(errorMessage);
    }
  };

  const handleExecutorConfigChange = (
    executorType: string,
    configuration: string,
    formData: unknown
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const executorsMap =
      localParsedProfiles.executors as unknown as ExecutorsMap;
    // Update the parsed profiles with the new config
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...executorsMap[executorType],
          [configuration]: {
            [executorType]: formData,
          },
        },
      },
    };

    markDirty(updatedProfiles);
  };

  const handleExecutorConfigSave = async (formData: unknown) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    // Clear any previous errors
    setSaveError(null);

    // Update the parsed profiles with the saved config
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: {
            [selectedExecutorType]: formData,
          },
        },
      },
    };

    // Update state
    setLocalParsedProfiles(updatedProfiles);

    // Save the updated profiles directly
    try {
      const contentToSave = JSON.stringify(updatedProfiles, null, 2);

      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the local content as well
      setLocalProfilesContent(contentToSave);

      // Refresh global system so new profiles are available elsewhere
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save profiles:', err);
      // Show actual API error message if available
      const errorMessage =
        err instanceof Error
          ? err.message
          : t('settings.agents.errors.saveConfigFailed');
      setSaveError(errorMessage);
    }
  };

  // Handle visibility toggle for an agent
  const handleVisibilityToggle = async (
    agentName: string,
    visible: boolean
  ) => {
    if (!localParsedProfiles) return;

    setSaveError(null);

    const updatedProfiles = {
      ...localParsedProfiles,
      visibility: {
        ...(localParsedProfiles.visibility || {}),
        [agentName]: visible,
      },
    };

    // Update state
    setLocalParsedProfiles(updatedProfiles);

    // Save the updated profiles
    try {
      const contentToSave = JSON.stringify(updatedProfiles, null, 2);

      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      setLocalProfilesContent(contentToSave);
      reloadSystem();
    } catch (err: unknown) {
      console.error('Failed to save visibility:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : t('settings.agents.errors.saveVisibilityFailed', {
              defaultValue: 'Failed to save visibility settings',
            });
      setSaveError(errorMessage);
    }
  };

  // Handle syncing configs between local and database
  const handleSyncConfigs = async (
    direction: 'local_to_db' | 'db_to_local'
  ) => {
    setSyncError(null);
    setSyncSuccess(false);
    setIsSyncing(true);

    try {
      const message = await agentConfigsApi.syncConfigs(
        selectedExecutorType,
        direction
      );
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);

      // Reload profiles if syncing from database to local
      if (direction === 'db_to_local') {
        reloadSystem();
      }

      console.log('Sync completed:', message);
    } catch (err: unknown) {
      console.error('Failed to sync configs:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : t('settings.agents.sync.error', {
              defaultValue: 'Failed to sync configurations',
            });
      setSyncError(errorMessage);
    } finally {
      setIsSyncing(false);
    }
  };

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.agents.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!!profilesError && (
        <Alert variant="destructive">
          <AlertDescription>
            {profilesError instanceof Error
              ? profilesError.message
              : String(profilesError)}
          </AlertDescription>
        </Alert>
      )}

      {profilesSuccess && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.agents.save.success')}
          </AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {syncSuccess && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.agents.sync.success', {
              defaultValue: 'Sync completed successfully',
            })}
          </AlertDescription>
        </Alert>
      )}

      {syncError && (
        <Alert variant="destructive">
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      )}

      {/* Storage Location Management */}
      {useFormEditor && localParsedProfiles?.executors && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('settings.agents.storage.title', {
                defaultValue: 'Storage Location',
              })}
            </CardTitle>
            <CardDescription>
              {t('settings.agents.storage.description', {
                defaultValue:
                  'Configure where agent configurations are stored. Local agents use project files, while remote agents use database storage.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">
                  {t('settings.agents.storage.currentLocation', {
                    defaultValue: 'Current Storage:',
                  })}
                </p>
                <p className="font-mono text-xs bg-muted p-2 rounded">
                  {profilesPath || 'Loading...'}
                </p>
              </div>
              
              {/* Sync Controls */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">
                  {t('settings.agents.storage.sync', {
                    defaultValue: 'Sync Configurations:',
                  })}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncConfigs('local_to_db')}
                    disabled={isSyncing || !selectedExecutorType}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    {t('settings.agents.storage.syncToDb', {
                      defaultValue: 'Local → Database',
                    })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSyncConfigs('db_to_local')}
                    disabled={isSyncing || !selectedExecutorType}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="mr-2 h-4 w-4" />
                    )}
                    {t('settings.agents.storage.syncFromDb', {
                      defaultValue: 'Database → Local',
                    })}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reloadSystem}
                    disabled={isSyncing}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('settings.agents.storage.reload', {
                      defaultValue: 'Reload',
                    })}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">
                  {t('settings.agents.storage.recommendations', {
                    defaultValue: 'Recommended Storage by Agent Type:',
                  })}
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded">
                      CLAUDE_CODE
                    </span>
                    <span>→</span>
                    <span className="font-mono text-xs">.claude/profiles.json</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded">
                      COPILOT
                    </span>
                    <span>→</span>
                    <span className="font-mono text-xs">.github/profiles.json</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-green-50 dark:bg-green-950 px-2 py-1 rounded">
                      DROID, AMP, etc.
                    </span>
                    <span>→</span>
                    <span className="font-mono text-xs">Database</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Visibility Management */}
      {useFormEditor &&
        localParsedProfiles?.executors &&
        Object.keys(localParsedProfiles.executors).length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    {t('settings.agents.visibility.title', {
                      defaultValue: 'Agent Visibility',
                    })}
                  </CardTitle>
                  <CardDescription>
                    {t('settings.agents.visibility.description', {
                      defaultValue:
                        'Toggle which agents appear in the configuration summary. Hidden agents remain functional.',
                    })}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="show-hidden-agents"
                    className="text-sm text-muted-foreground"
                  >
                    {t('settings.agents.visibility.showHidden', {
                      defaultValue: 'Show hidden',
                    })}
                  </Label>
                  <Switch
                    id="show-hidden-agents"
                    checked={showHiddenAgents}
                    onCheckedChange={setShowHiddenAgents}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {Object.keys(localParsedProfiles.executors)
                  .filter((agentName) => {
                    const visible = isAgentVisible(
                      localParsedProfiles.visibility as
                        | VisibilityMap
                        | undefined,
                      agentName
                    );
                    return showHiddenAgents || visible;
                  })
                  .map((agentName) => {
                    const visible = isAgentVisible(
                      localParsedProfiles.visibility as
                        | VisibilityMap
                        | undefined,
                      agentName
                    );
                    return (
                      <div
                        key={agentName}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          {visible ? (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium">
                            {agentName}
                          </span>
                        </div>
                        <Switch
                          checked={visible}
                          onCheckedChange={(checked) =>
                            handleVisibilityToggle(agentName, checked)
                          }
                          disabled={profilesSaving}
                        />
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Configuration Summary Table - only show when using form editor, not JSON editor */}
      {useFormEditor &&
        localParsedProfiles?.executors &&
        Object.keys(localParsedProfiles.executors).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.agents.summary.title')}</CardTitle>
              <CardDescription>
                {t('settings.agents.summary.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>
                      {t('settings.agents.summary.agent')}
                    </TableHeaderCell>
                    <TableHeaderCell>
                      {t('settings.agents.summary.variant')}
                    </TableHeaderCell>
                    <TableHeaderCell>
                      {t('settings.agents.summary.model')}
                    </TableHeaderCell>
                    <TableHeaderCell>
                      {t('settings.agents.summary.keySettings')}
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {buildConfigSummary(
                    localParsedProfiles.executors as unknown as ExecutorsMap,
                    localParsedProfiles.visibility as VisibilityMap | undefined
                  ).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.agent}</TableCell>
                      <TableCell>{row.variant}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.model}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {row.keySettings}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.agents.title')}</CardTitle>
          <CardDescription>{t('settings.agents.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Editor type toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-form-editor"
              checked={!useFormEditor}
              onCheckedChange={(checked) => setUseFormEditor(!checked)}
              disabled={profilesLoading || !localParsedProfiles}
            />
            <Label htmlFor="use-form-editor">
              {t('settings.agents.editor.formLabel')}
            </Label>
          </div>

          {useFormEditor &&
          localParsedProfiles &&
          localParsedProfiles.executors ? (
            // Form-based editor
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="executor-type">
                    {t('settings.agents.editor.agentLabel')}
                  </Label>
                  <Select
                    value={selectedExecutorType}
                    onValueChange={(value) => {
                      setSelectedExecutorType(value as BaseCodingAgent);
                      // Reset configuration selection when executor type changes
                      setSelectedConfiguration('DEFAULT');
                    }}
                  >
                    <SelectTrigger id="executor-type">
                      <SelectValue
                        placeholder={t(
                          'settings.agents.editor.agentPlaceholder'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(localParsedProfiles.executors)
                        .filter((type) =>
                          isAgentVisible(
                            localParsedProfiles.visibility as
                              | VisibilityMap
                              | undefined,
                            type
                          )
                        )
                        .map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="configuration">
                    {t('settings.agents.editor.configLabel')}
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedConfiguration}
                      onValueChange={(value) => {
                        if (value === '__create__') {
                          openCreateDialog();
                        } else {
                          setSelectedConfiguration(value);
                        }
                      }}
                      disabled={
                        !localParsedProfiles.executors[selectedExecutorType]
                      }
                    >
                      <SelectTrigger id="configuration">
                        <SelectValue
                          placeholder={t(
                            'settings.agents.editor.configPlaceholder'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).map((configuration) => (
                          <SelectItem key={configuration} value={configuration}>
                            {configuration}
                          </SelectItem>
                        ))}
                        <SelectItem value="__create__">
                          {t('settings.agents.editor.createNew')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-10"
                      onClick={() => openDeleteDialog(selectedConfiguration)}
                      disabled={
                        profilesSaving ||
                        !localParsedProfiles.executors[selectedExecutorType] ||
                        Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).length <= 1
                      }
                      title={
                        Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).length <= 1
                          ? t('settings.agents.editor.deleteTitle')
                          : t('settings.agents.editor.deleteButton', {
                              name: selectedConfiguration,
                            })
                      }
                    >
                      {t('settings.agents.editor.deleteText')}
                    </Button>
                  </div>
                </div>
              </div>

              {(() => {
                const executorsMap =
                  localParsedProfiles.executors as unknown as ExecutorsMap;
                return (
                  !!executorsMap[selectedExecutorType]?.[
                    selectedConfiguration
                  ]?.[selectedExecutorType] && (
                    <ExecutorConfigForm
                      key={`${selectedExecutorType}-${selectedConfiguration}`}
                      executor={selectedExecutorType}
                      value={
                        (executorsMap[selectedExecutorType][
                          selectedConfiguration
                        ][selectedExecutorType] as Record<string, unknown>) ||
                        {}
                      }
                      onChange={(formData) =>
                        handleExecutorConfigChange(
                          selectedExecutorType,
                          selectedConfiguration,
                          formData
                        )
                      }
                      onSave={handleExecutorConfigSave}
                      disabled={profilesSaving}
                      isSaving={profilesSaving}
                      isDirty={isDirty}
                    />
                  )
                );
              })()}
            </div>
          ) : (
            // Raw JSON editor
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profiles-editor">
                  {t('settings.agents.editor.jsonLabel')}
                </Label>
                <JSONEditor
                  id="profiles-editor"
                  placeholder={t('settings.agents.editor.jsonPlaceholder')}
                  value={
                    profilesLoading
                      ? t('settings.agents.editor.jsonLoading')
                      : localProfilesContent
                  }
                  onChange={handleProfilesChange}
                  disabled={profilesLoading}
                  minHeight={300}
                />
              </div>

              {!profilesError && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">
                      {t('settings.agents.editor.storageInfo', {
                        defaultValue: 'Storage:',
                      })}
                    </span>{' '}
                    <span className="font-mono text-xs">
                      {t('settings.agents.editor.storedOnServer', {
                        defaultValue:
                          'Agent configurations are stored on the server and synced across sessions.',
                      })}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!useFormEditor && (
        <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
          <div className="flex justify-end">
            <Button
              onClick={handleSaveProfiles}
              disabled={!isDirty || profilesSaving || !!profilesError}
            >
              {profilesSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('settings.agents.save.button')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
