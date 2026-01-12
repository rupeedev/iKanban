import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideChrome = view === 'preview' || view === 'diffs';

  if (shouldHideChrome) {
    return (
      <>
        <DevBanner />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </>
    );
  }

  return (
    <>
      <DevBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <FeatureErrorBoundary featureName="Sidebar" data-testid="sidebar-error">
          <Sidebar />
        </FeatureErrorBoundary>
        <div className="flex flex-col flex-1 min-w-0">
          <FeatureErrorBoundary featureName="Navigation" data-testid="navbar-error">
            <Navbar />
          </FeatureErrorBoundary>
          <FeatureErrorBoundary featureName="Page Content" data-testid="content-error">
            <div className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </div>
          </FeatureErrorBoundary>
        </div>
      </div>
    </>
  );
}
