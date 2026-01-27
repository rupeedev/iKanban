import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useKeyExit } from '@/keyboard/hooks';
import { Scope } from '@/keyboard/registry';
import { usePreviousPath } from '@/hooks/usePreviousPath';
import {
  LayoutDashboard,
  Mail,
  Shield,
  Users,
  X,
  ShieldCheck,
  Flag,
} from 'lucide-react';

const adminNavigation = [
  {
    path: '',
    label: 'Dashboard',
    description: 'Overview and quick actions',
    icon: LayoutDashboard,
  },
  {
    path: 'invitations',
    label: 'Invitations',
    description: 'Manage sign-up invites',
    icon: Mail,
  },
  {
    path: 'permissions',
    label: 'Permissions',
    description: 'Role and access control',
    icon: Shield,
  },
  {
    path: 'users',
    label: 'Users',
    description: 'User management',
    icon: Users,
  },
  {
    path: 'flagged-users',
    label: 'Trust & Safety',
    description: 'Review flagged users',
    icon: Flag,
  },
];

export function AdminLayout() {
  const { enableScope, disableScope } = useHotkeysContext();
  const goToPreviousPath = usePreviousPath();

  useEffect(() => {
    enableScope(Scope.SETTINGS);
    return () => {
      disableScope(Scope.SETTINGS);
    };
  }, [enableScope, disableScope]);

  useKeyExit(goToPreviousPath, { scope: Scope.SETTINGS });

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto px-4 py-8">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between sticky top-0 bg-background z-10 py-4 -mx-4 px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">
                System control dashboard
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={goToPreviousPath}
            className="h-8 px-2 rounded-none border border-foreground/20 hover:border-foreground/30 transition-all hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center gap-1.5"
          >
            <X className="h-4 w-4" />
            <span className="text-xs font-medium">ESC</span>
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 mt-4">
          {/* Sidebar Navigation */}
          <aside className="w-full lg:w-64 lg:shrink-0 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            <nav className="space-y-1">
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === ''}
                    className={({ isActive }) =>
                      cn(
                        'flex items-start gap-3 px-3 py-2.5 text-sm transition-colors rounded-md',
                        'hover:bg-muted focus:outline-none',
                        isActive
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs opacity-70">
                        {item.description}
                      </div>
                    </div>
                  </NavLink>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
