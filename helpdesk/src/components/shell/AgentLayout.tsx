import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { startLiveUpdates, stopLiveUpdates, useTickets } from '@/store/useTickets';
import { NavRail } from './NavRail';
import { registerNavigate } from './openTab';
import { RightRail, showsRightRail } from './RightRail';
import { useGlobalShortcuts } from './shortcuts';
import { TopBar } from './TopBar';
import { useRouteTab } from './useRouteTab';

/** Shell da área do agente: 100vh sem rolagem de página; cada região rola sozinha. */
export function AgentLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    registerNavigate((to) => navigate(to));
    return () => registerNavigate(null);
  }, [navigate]);

  useEffect(() => {
    const { loaded, loading, load } = useTickets.getState();
    if (!loaded && !loading) void load();
    startLiveUpdates();
    return () => stopLiveUpdates();
  }, []);

  useRouteTab();
  useGlobalShortcuts();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-sm text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-fg-muted">
                <Spinner size={20} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        {showsRightRail(pathname) ? <RightRail /> : null}
      </div>
    </div>
  );
}
