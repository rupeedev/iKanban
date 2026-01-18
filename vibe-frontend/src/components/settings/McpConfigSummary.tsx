import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/table/table';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, RefreshCw, Server, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { McpConfig, JsonValue } from 'shared/types';
import { getServerKeyReferenceSummary } from '@/lib/mcpKeyReference';

interface McpServerRow {
  name: string;
  type: string;
  status: 'configured' | 'preconfigured';
  keyRefSummary: string | null;
}

interface McpConfigSummaryProps {
  mcpConfig: McpConfig | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function getServerType(serverConfig: unknown): string {
  if (!serverConfig || typeof serverConfig !== 'object') {
    return 'unknown';
  }

  const config = serverConfig as Record<string, unknown>;

  if ('type' in config && typeof config.type === 'string') {
    return config.type;
  }
  if ('command' in config) {
    return 'stdio';
  }
  if ('url' in config) {
    return 'http';
  }
  return 'unknown';
}

export function McpConfigSummary({
  mcpConfig,
  isLoading = false,
  onRefresh,
  isRefreshing = false,
}: McpConfigSummaryProps) {
  const { t } = useTranslation('settings');

  const serverRows = useMemo<McpServerRow[]>(() => {
    if (!mcpConfig) return [];

    const rows: McpServerRow[] = [];

    // Add configured servers
    if (mcpConfig.servers && typeof mcpConfig.servers === 'object') {
      for (const [name, config] of Object.entries(mcpConfig.servers)) {
        if (config) {
          rows.push({
            name,
            type: getServerType(config),
            status: 'configured',
            keyRefSummary: getServerKeyReferenceSummary(config as JsonValue),
          });
        }
      }
    }

    // Sort by name
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [mcpConfig]);

  // Check if any servers use key references
  const hasKeyReferences = serverRows.some((row) => row.keyRefSummary !== null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.mcp.summary.title')}</CardTitle>
          <CardDescription>
            {t('settings.mcp.summary.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('settings.mcp.summary.title')}</CardTitle>
            <CardDescription>
              {t('settings.mcp.summary.descriptionServers')}
            </CardDescription>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
              title={t('settings.mcp.summary.refresh')}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {serverRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('settings.mcp.summary.noServersConfigured')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.mcp.summary.addServerHint')}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  {t('settings.mcp.summary.serverName')}
                </TableHeaderCell>
                <TableHeaderCell>
                  {t('settings.mcp.summary.serverType')}
                </TableHeaderCell>
                <TableHeaderCell>
                  {t('settings.mcp.summary.status')}
                </TableHeaderCell>
                {hasKeyReferences && (
                  <TableHeaderCell>
                    {t('settings.mcp.summary.apiKeys', 'API Keys')}
                  </TableHeaderCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {serverRows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium font-mono text-sm">
                    {row.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {row.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'configured' ? 'default' : 'secondary'
                      }
                      className="text-xs"
                    >
                      {row.status === 'configured'
                        ? t('settings.mcp.summary.statusConfigured')
                        : t('settings.mcp.summary.statusPreconfigured')}
                    </Badge>
                  </TableCell>
                  {hasKeyReferences && (
                    <TableCell>
                      {row.keyRefSummary ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 cursor-help"
                            >
                              <Key className="h-3 w-3" />
                              {t('settings.mcp.summary.keyLinked', 'Linked')}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{row.keyRefSummary}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
