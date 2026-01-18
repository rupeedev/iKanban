import { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import type { BaseCodingAgent, ExecutorConfig, McpConfig } from 'shared/types';
import { mcpServersApi } from '@/lib/api';

interface McpSummaryRow {
  agent: string;
  serverCount: number;
  serverTypes: string;
  isLoading: boolean;
  error: string | null;
}

interface McpConfigSummaryProps {
  profiles: Record<string, ExecutorConfig> | null | undefined;
  refreshKey?: number;
}

// Extract server types from MCP configuration
function extractServerTypes(mcpConfig: McpConfig): string[] {
  const types = new Set<string>();

  if (mcpConfig.servers && typeof mcpConfig.servers === 'object') {
    for (const serverConfig of Object.values(mcpConfig.servers)) {
      if (
        serverConfig &&
        typeof serverConfig === 'object' &&
        'type' in serverConfig
      ) {
        const serverType = (serverConfig as { type?: string }).type;
        if (serverType) {
          types.add(serverType);
        }
      } else if (
        serverConfig &&
        typeof serverConfig === 'object' &&
        'command' in serverConfig
      ) {
        // stdio type (has command but no explicit type)
        types.add('stdio');
      } else if (
        serverConfig &&
        typeof serverConfig === 'object' &&
        'url' in serverConfig
      ) {
        // http/sse type
        types.add('http');
      }
    }
  }

  return Array.from(types).sort();
}

export function McpConfigSummary({
  profiles,
  refreshKey = 0,
}: McpConfigSummaryProps) {
  const { t } = useTranslation('settings');
  const [summaryRows, setSummaryRows] = useState<McpSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAllMcpConfigs = async () => {
      if (!profiles) {
        setIsLoading(false);
        return;
      }

      const profileKeys = Object.keys(profiles);

      // Initialize rows with loading state (use placeholder text, will be replaced)
      const initialRows: McpSummaryRow[] = profileKeys.map((key) => ({
        agent: key,
        serverCount: 0,
        serverTypes: '...',
        isLoading: true,
        error: null,
      }));
      setSummaryRows(initialRows);
      setIsLoading(false);

      // Load MCP config for each profile in parallel
      const results = await Promise.allSettled(
        profileKeys.map(async (profileKey) => {
          try {
            const result = await mcpServersApi.load({
              executor: profileKey as BaseCodingAgent,
            });
            return {
              profileKey,
              mcpConfig: result.mcp_config,
              error: null,
            };
          } catch (err) {
            // Agent may not support MCP
            return {
              profileKey,
              mcpConfig: null,
              error: err instanceof Error ? err.message : 'Failed to load',
            };
          }
        })
      );

      // Update rows with actual data
      const updatedRows: McpSummaryRow[] = profileKeys.map((profileKey) => {
        const resultIndex = profileKeys.indexOf(profileKey);
        const result = results[resultIndex];

        if (result.status === 'fulfilled' && result.value.mcpConfig) {
          const serverCount = Object.keys(
            result.value.mcpConfig.servers || {}
          ).length;
          const serverTypes = extractServerTypes(result.value.mcpConfig);

          return {
            agent: profileKey,
            serverCount,
            serverTypes: serverTypes.length > 0 ? serverTypes.join(', ') : '-',
            isLoading: false,
            error: null,
          };
        } else if (
          result.status === 'fulfilled' &&
          result.value.error?.includes('does not support MCP')
        ) {
          return {
            agent: profileKey,
            serverCount: 0,
            serverTypes: '-',
            isLoading: false,
            error: 'MCP not supported',
          };
        } else {
          return {
            agent: profileKey,
            serverCount: 0,
            serverTypes: '-',
            isLoading: false,
            error:
              result.status === 'rejected'
                ? 'Failed to load'
                : result.value.error || null,
          };
        }
      });

      setSummaryRows(updatedRows);
    };

    loadAllMcpConfigs();
  }, [profiles, refreshKey]);

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

  if (!profiles || summaryRows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.mcp.summary.title')}</CardTitle>
        <CardDescription>
          {t('settings.mcp.summary.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>
                {t('settings.mcp.summary.agent')}
              </TableHeaderCell>
              <TableHeaderCell>
                {t('settings.mcp.summary.servers')}
              </TableHeaderCell>
              <TableHeaderCell>
                {t('settings.mcp.summary.types')}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summaryRows.map((row) => (
              <TableRow key={row.agent}>
                <TableCell className="font-medium">{row.agent}</TableCell>
                <TableCell>
                  {row.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : row.error ? (
                    <span className="text-muted-foreground text-sm">
                      {row.error}
                    </span>
                  ) : row.serverCount > 0 ? (
                    row.serverCount
                  ) : (
                    t('settings.mcp.summary.noServers')
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    row.serverTypes
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
