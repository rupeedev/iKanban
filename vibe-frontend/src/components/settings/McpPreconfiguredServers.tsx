import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Plus, ExternalLink } from 'lucide-react';
import type { McpConfig } from 'shared/types';

interface McpPreconfiguredServersProps {
  mcpConfig: McpConfig;
  onAddServer: (key: string) => void;
}

type ServerMeta = {
  name?: string;
  description?: string;
  url?: string;
  icon?: string;
  category?: string;
};

const CATEGORY_ORDER = [
  'database',
  'backend',
  'cloud',
  'infrastructure',
  'deployment',
  'version_control',
  'api',
  'testing',
  'monitoring',
  'payments',
  'productivity',
  'communication',
  'documentation',
  'search',
  'utilities',
];

const CATEGORY_LABELS: Record<string, string> = {
  database: 'Database',
  backend: 'Backend Services',
  cloud: 'Cloud Providers',
  infrastructure: 'Infrastructure',
  deployment: 'Deployment',
  version_control: 'Version Control',
  api: 'APIs',
  testing: 'Testing',
  monitoring: 'Monitoring',
  payments: 'Payments',
  productivity: 'Productivity',
  communication: 'Communication',
  documentation: 'Documentation',
  search: 'Search',
  utilities: 'Utilities',
};

export function McpPreconfiguredServers({
  mcpConfig,
  onAddServer,
}: McpPreconfiguredServersProps) {
  const { t } = useTranslation('settings');
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());

  const handleIconError = useCallback(
    (key: string) => () => {
      setFailedIcons((prev) => new Set(prev).add(key));
    },
    []
  );

  const preconfiguredObj = useMemo(
    () => (mcpConfig.preconfigured ?? {}) as Record<string, unknown>,
    [mcpConfig.preconfigured]
  );

  const meta = useMemo(
    () =>
      typeof preconfiguredObj.meta === 'object' &&
      preconfiguredObj.meta !== null
        ? (preconfiguredObj.meta as Record<string, ServerMeta>)
        : {},
    [preconfiguredObj]
  );

  const servers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(preconfiguredObj).filter(([k]) => k !== 'meta')
      ) as Record<string, unknown>,
    [preconfiguredObj]
  );

  const getMetaFor = useCallback(
    (key: string): ServerMeta => meta[key] || {},
    [meta]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    Object.keys(servers).forEach((key) => {
      const m = getMetaFor(key);
      if (m.category) cats.add(m.category);
    });
    return CATEGORY_ORDER.filter((c) => cats.has(c));
  }, [servers, getMetaFor]);

  const filteredServers = useMemo(() => {
    const entries = Object.entries(servers);
    if (selectedCategory === 'all') return entries;
    return entries.filter(([key]) => {
      const m = getMetaFor(key);
      return m.category === selectedCategory;
    });
  }, [servers, selectedCategory, getMetaFor]);

  const toggleExpand = (key: string) => {
    setExpandedServer(expandedServer === key ? null : key);
  };

  const handleAddAndClose = (key: string) => {
    onAddServer(key);
    setExpandedServer(null);
  };

  if (Object.keys(servers).length === 0) {
    return null;
  }

  return (
    <div className="pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>{t('settings.mcp.labels.popularServers')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('settings.mcp.labels.serverHelper')}
          </p>
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {CATEGORY_LABELS[cat] || cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        {filteredServers.map(([key, serverConfig]) => {
          const metaObj = getMetaFor(key);
          const name = metaObj.name || key;
          const description = metaObj.description || 'No description';
          const icon = metaObj.icon ? `/${metaObj.icon}` : null;
          const category = metaObj.category;
          const url = metaObj.url;
          const isExpanded = expandedServer === key;
          const configJson = JSON.stringify(serverConfig, null, 2);

          return (
            <Collapsible
              key={key}
              open={isExpanded}
              onOpenChange={() => toggleExpand(key)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg border bg-muted grid place-items-center overflow-hidden flex-shrink-0">
                            {icon && !failedIcons.has(key) ? (
                              <img
                                src={icon}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={handleIconError(key)}
                              />
                            ) : (
                              <span className="font-semibold text-sm">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              {name}
                              {category && (
                                <Badge variant="secondary" className="text-xs">
                                  {CATEGORY_LABELS[category] || category}
                                </Badge>
                              )}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground truncate max-w-md">
                              {description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4 space-y-3">
                    <div className="rounded-md bg-muted p-3">
                      <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                        {configJson}
                      </pre>
                    </div>
                    <div className="flex items-center justify-between">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Documentation
                        </a>
                      )}
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddAndClose(key);
                        }}
                        className="ml-auto"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to Config
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
