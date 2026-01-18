import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Label } from '@/components/ui/label';
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
};

export function McpPreconfiguredServers({
  mcpConfig,
  onAddServer,
}: McpPreconfiguredServersProps) {
  const { t } = useTranslation('settings');

  const preconfiguredObj = (mcpConfig.preconfigured ?? {}) as Record<
    string,
    unknown
  >;
  const meta =
    typeof preconfiguredObj.meta === 'object' && preconfiguredObj.meta !== null
      ? (preconfiguredObj.meta as Record<string, ServerMeta>)
      : {};
  const servers = Object.fromEntries(
    Object.entries(preconfiguredObj).filter(([k]) => k !== 'meta')
  ) as Record<string, unknown>;

  const getMetaFor = (key: string): ServerMeta => meta[key] || {};

  if (Object.keys(servers).length === 0) {
    return null;
  }

  return (
    <div className="pt-4">
      <Label>{t('settings.mcp.labels.popularServers')}</Label>
      <p className="text-sm text-muted-foreground mb-2">
        {t('settings.mcp.labels.serverHelper')}
      </p>

      <div className="relative overflow-hidden rounded-xl border bg-background">
        <Carousel className="w-full px-4 py-3">
          <CarouselContent className="gap-3 justify-center">
            {Object.entries(servers).map(([key]) => {
              const metaObj = getMetaFor(key);
              const name = metaObj.name || key;
              const description = metaObj.description || 'No description';
              const icon = metaObj.icon ? `/${metaObj.icon}` : null;

              return (
                <CarouselItem key={name} className="sm:basis-1/3 lg:basis-1/4">
                  <button
                    type="button"
                    onClick={() => onAddServer(key)}
                    aria-label={`Add ${name} to config`}
                    className="group w-full text-left outline-none"
                  >
                    <Card className="h-32 rounded-xl border hover:shadow-md transition">
                      <CardHeader className="pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-lg border bg-muted grid place-items-center overflow-hidden">
                            {icon ? (
                              <img
                                src={icon}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="font-semibold">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <CardTitle className="text-base font-medium truncate">
                            {name}
                          </CardTitle>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-2 px-4">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {description}
                        </p>
                      </CardContent>
                    </Card>
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>

          <CarouselPrevious className="left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-background/80 shadow-sm backdrop-blur hover:bg-background" />
          <CarouselNext className="right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-background/80 shadow-sm backdrop-blur hover:bg-background" />
        </Carousel>
      </div>
    </div>
  );
}
