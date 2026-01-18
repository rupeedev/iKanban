import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Key, Check, X, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { aiProviderKeysApi, AiProviderKeyInfo } from '@/lib/api';
import {
  createKeyReference,
  getProviderDisplayName,
  SUPPORTED_PROVIDERS,
} from '@/lib/mcpKeyReference';

export function McpKeyReferenceHelp() {
  const { t } = useTranslation('settings');
  const [providerKeys, setProviderKeys] = useState<AiProviderKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);

  const loadProviderKeys = useCallback(async () => {
    try {
      setLoading(true);
      const keys = await aiProviderKeysApi.list();
      setProviderKeys(keys);
    } catch (err) {
      console.error('Failed to load AI provider keys:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviderKeys();
  }, [loadProviderKeys]);

  const configuredProviders = new Set(providerKeys.map((k) => k.provider));

  const handleCopyReference = async (provider: string) => {
    const reference = createKeyReference(provider);
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedProvider(provider);
      setTimeout(() => setCopiedProvider(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4" />
          {t('settings.mcp.keyReference.title', 'API Key References')}
        </CardTitle>
        <CardDescription>
          {t(
            'settings.mcp.keyReference.description',
            'Use secure key references instead of exposing API keys in your configuration.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Syntax Help */}
        <div className="rounded-md bg-muted p-3 space-y-2">
          <p className="text-sm font-medium">
            {t('settings.mcp.keyReference.syntaxTitle', 'Reference Syntax')}
          </p>
          <code className="block text-xs bg-background px-2 py-1 rounded border font-mono">
            {'${AI_KEY:provider_name}'}
          </code>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.mcp.keyReference.syntaxHelp',
              'Replace "provider_name" with: openai, anthropic, or google'
            )}
          </p>
        </div>

        {/* Example Usage */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">
            {t('settings.mcp.keyReference.exampleTitle', 'Example Usage')}
          </p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto font-mono">
            {`{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "CONTEXT7_API_KEY": "\${AI_KEY:openai}"
    }
  }
}`}
          </pre>
        </div>

        {/* Available Keys */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t('settings.mcp.keyReference.availableKeys', 'Available Keys')}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {SUPPORTED_PROVIDERS.map((provider) => {
                const isConfigured = configuredProviders.has(provider);
                const reference = createKeyReference(provider);

                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between px-3 py-2 rounded-md border"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {getProviderDisplayName(provider)}
                      </span>
                      {isConfigured ? (
                        <Badge
                          variant="outline"
                          className="text-xs text-green-600 dark:text-green-400 gap-1"
                        >
                          <Check className="h-3 w-3" />
                          {t(
                            'settings.mcp.keyReference.configured',
                            'Configured'
                          )}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground gap-1"
                        >
                          <X className="h-3 w-3" />
                          {t(
                            'settings.mcp.keyReference.notConfigured',
                            'Not configured'
                          )}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isConfigured && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => handleCopyReference(provider)}
                              >
                                {copiedProvider === provider ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                {copiedProvider === provider
                                  ? t(
                                      'settings.mcp.keyReference.copied',
                                      'Copied!'
                                    )
                                  : t(
                                      'settings.mcp.keyReference.copyReference',
                                      'Copy reference'
                                    )}
                              </p>
                              <code className="text-xs block mt-1">
                                {reference}
                              </code>
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Link to AI Provider Keys page */}
          <div className="pt-2">
            <Link
              to="/settings/ai-provider-keys"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t(
                'settings.mcp.keyReference.manageKeys',
                'Manage API keys in AI Provider Keys'
              )}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
