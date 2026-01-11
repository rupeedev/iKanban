import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { aiProviderKeysApi, AiProviderKeyInfo } from '@/lib/api';

type AiProvider = 'anthropic' | 'google' | 'openai';

interface ProviderConfig {
  name: string;
  description: string;
  placeholder: string;
  prefix: string;
}

const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Claude models for AI assistance',
    placeholder: 'sk-ant-api03-...',
    prefix: 'sk-ant-',
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Gemini models for AI assistance',
    placeholder: 'AIza...',
    prefix: 'AIza',
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'GPT models for AI assistance',
    placeholder: 'sk-...',
    prefix: 'sk-',
  },
};

export function AiProviderKeysSettings() {
  const { t } = useTranslation('settings');
  const [providerKeys, setProviderKeys] = useState<AiProviderKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add/Edit dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [keyToDelete, setKeyToDelete] = useState<AiProviderKeyInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test key state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const loadProviderKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const keys = await aiProviderKeysApi.list();
      setProviderKeys(keys);
    } catch (err) {
      setError(t('settings.aiProviderKeys.errors.loadFailed'));
      console.error('Failed to load AI provider keys:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Load provider keys
  useEffect(() => {
    loadProviderKeys();
  }, [loadProviderKeys]);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;

    try {
      setSaving(true);
      setError(null);
      await aiProviderKeysApi.upsert({
        provider: selectedProvider,
        api_key: apiKey.trim(),
      });
      setSuccess(t('settings.aiProviderKeys.saveSuccess'));
      setTimeout(() => setSuccess(null), 3000);
      setShowAddDialog(false);
      setApiKey('');
      setShowApiKey(false);
      await loadProviderKeys();
    } catch (err) {
      setError(t('settings.aiProviderKeys.errors.saveFailed'));
      console.error('Failed to save AI provider key:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    try {
      setDeleting(true);
      setError(null);
      await aiProviderKeysApi.delete(provider);
      setSuccess(t('settings.aiProviderKeys.deleteSuccess'));
      setTimeout(() => setSuccess(null), 3000);
      await loadProviderKeys();
    } catch (err) {
      setError(t('settings.aiProviderKeys.errors.deleteFailed'));
      console.error('Failed to delete AI provider key:', err);
    } finally {
      setDeleting(false);
      setKeyToDelete(null);
    }
  };

  const handleTestKey = async (provider: string) => {
    try {
      setTestingProvider(provider);
      setError(null);
      const isValid = await aiProviderKeysApi.test(provider);
      if (isValid) {
        setSuccess(t('settings.aiProviderKeys.testSuccess', { provider: PROVIDERS[provider as AiProvider]?.name || provider }));
      } else {
        setError(t('settings.aiProviderKeys.testFailed', { provider: PROVIDERS[provider as AiProvider]?.name || provider }));
      }
      setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 3000);
      await loadProviderKeys();
    } catch (err) {
      setError(t('settings.aiProviderKeys.errors.testFailed'));
      console.error('Failed to test AI provider key:', err);
    } finally {
      setTestingProvider(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getConfiguredProviders = () => {
    return new Set(providerKeys.map((k) => k.provider));
  };

  const getAvailableProviders = () => {
    const configured = getConfiguredProviders();
    return (Object.keys(PROVIDERS) as AiProvider[]).filter(
      (p) => !configured.has(p)
    );
  };

  const openAddDialog = () => {
    const available = getAvailableProviders();
    if (available.length > 0) {
      setSelectedProvider(available[0]);
    }
    setApiKey('');
    setShowApiKey(false);
    setShowAddDialog(true);
  };

  const openEditDialog = (providerKey: AiProviderKeyInfo) => {
    setSelectedProvider(providerKey.provider as AiProvider);
    setApiKey('');
    setShowApiKey(false);
    setShowAddDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{t('settings.aiProviderKeys.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {t('settings.aiProviderKeys.title')}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {t('settings.aiProviderKeys.description')}
              </CardDescription>
            </div>
            {getAvailableProviders().length > 0 && (
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                {t('settings.aiProviderKeys.addButton')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {providerKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.aiProviderKeys.noKeys')}</p>
              <p className="text-sm mt-1">{t('settings.aiProviderKeys.noKeysHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {providerKeys.map((key) => {
                const config = PROVIDERS[key.provider as AiProvider];
                return (
                  <div
                    key={key.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {config?.name || key.provider}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-4">
                        <span>
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                            {key.key_prefix}...
                          </code>
                        </span>
                        <span>
                          {t('settings.aiProviderKeys.table.added')}: {formatDate(key.created_at)}
                        </span>
                        {key.last_validated_at && (
                          <span>
                            {t('settings.aiProviderKeys.table.validated')}: {formatDate(key.last_validated_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${
                          key.is_valid
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-destructive'
                        }`}
                      >
                        {key.is_valid
                          ? t('settings.aiProviderKeys.status.valid')
                          : t('settings.aiProviderKeys.status.invalid')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestKey(key.provider)}
                        disabled={testingProvider === key.provider}
                        title={t('settings.aiProviderKeys.testButton')}
                      >
                        {testingProvider === key.provider ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(key)}
                        title={t('settings.aiProviderKeys.updateButton')}
                      >
                        {t('settings.aiProviderKeys.updateButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setKeyToDelete(key)}
                        className="text-destructive hover:text-destructive"
                        title={t('settings.aiProviderKeys.deleteButton')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.aiProviderKeys.info.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('settings.aiProviderKeys.info.description')}
          </p>
          <div className="space-y-3">
            {(Object.entries(PROVIDERS) as [AiProvider, ProviderConfig][]).map(
              ([provider, config]) => (
                <div key={provider} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div>
                    <div className="font-medium text-sm">{config.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {config.description}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Key Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.aiProviderKeys.addDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.aiProviderKeys.addDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="provider">{t('settings.aiProviderKeys.addDialog.providerLabel')}</Label>
              <Select
                value={selectedProvider}
                onValueChange={(v) => setSelectedProvider(v as AiProvider)}
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PROVIDERS) as [AiProvider, ProviderConfig][]).map(
                    ([provider, config]) => (
                      <SelectItem key={provider} value={provider}>
                        {config.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">{t('settings.aiProviderKeys.addDialog.keyLabel')}</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={PROVIDERS[selectedProvider]?.placeholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && apiKey.trim()) {
                      handleSaveKey();
                    }
                  }}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.aiProviderKeys.addDialog.keyHint', {
                  prefix: PROVIDERS[selectedProvider]?.prefix,
                })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('settings.aiProviderKeys.addDialog.cancel')}
            </Button>
            <Button onClick={handleSaveKey} disabled={!apiKey.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('settings.aiProviderKeys.addDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!keyToDelete} onOpenChange={() => setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.aiProviderKeys.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.aiProviderKeys.deleteDialog.description', {
                provider: PROVIDERS[keyToDelete?.provider as AiProvider]?.name || keyToDelete?.provider,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t('settings.aiProviderKeys.deleteDialog.warning')}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyToDelete(null)}>
              {t('settings.aiProviderKeys.deleteDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => keyToDelete && handleDeleteKey(keyToDelete.provider)}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('settings.aiProviderKeys.deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
