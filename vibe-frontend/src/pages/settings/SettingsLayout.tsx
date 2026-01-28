import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Cpu,
  Server,
  RefreshCw,
  FolderOpen,
  Key,
  Briefcase,
  Bot,
  CreditCard,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const settingsNavigation = [
  {
    path: 'general',
    icon: Settings,
  },
  {
    path: 'projects',
    icon: FolderOpen,
  },
  {
    path: 'issue-labels',
    icon: Tag,
  },
  {
    path: 'workspace',
    icon: Briefcase,
  },
  {
    path: 'billing',
    icon: CreditCard,
  },
  {
    path: 'agents',
    icon: Cpu,
  },
  {
    path: 'mcp',
    icon: Server,
  },
  {
    path: 'api-keys',
    icon: Key,
  },
  {
    path: 'ai-provider-keys',
    icon: Bot,
  },
];

export function SettingsLayout() {
  const { t } = useTranslation('settings');

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-6">
        {/* Header with title and refresh button */}
        <div className="flex items-center justify-between sticky top-0 bg-background z-10 pb-4">
          <h1 className="text-2xl font-semibold">
            {t('settings.layout.nav.title')}
          </h1>
          <Button
            variant="ghost"
            onClick={() => window.location.reload()}
            className="h-8 px-2 rounded-none border border-foreground/20 hover:border-foreground/30 transition-all hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center gap-1.5"
            title={t('settings.layout.refresh', {
              defaultValue: 'Refresh page',
            })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="w-full lg:w-56 lg:shrink-0 lg:sticky lg:top-16 lg:h-fit lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <nav className="space-y-0.5">
              {settingsNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    className={({ isActive }) =>
                      cn(
                        'flex items-start gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                        'hover:bg-accent/50 hover:text-accent-foreground',
                        isActive
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {t(`settings.layout.nav.${item.path}`)}
                      </div>
                      <div className="text-xs opacity-70">
                        {t(`settings.layout.nav.${item.path}Desc`)}
                      </div>
                    </div>
                  </NavLink>
                );
              })}
            </nav>
          </aside>

          {/* Main Content - full width */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
