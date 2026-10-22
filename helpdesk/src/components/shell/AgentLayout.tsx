import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MAIN_ID, SkipLink } from '@/components/a11y/SkipLink';
import { Spinner } from '@/components/ui';
import { startLiveUpdates, stopLiveUpdates, useTickets } from '@/store/useTickets';
import { ErrorBoundary } from './ErrorBoundary';
import { NavRail } from './NavRail';
import { registerNavigate } from './openTab';
import { RealModeNotice } from './RealModeNotice';
import { RightRail, showsRightRail } from './RightRail';
import { ShortcutsHelpDialog } from './ShortcutsHelp';
import { useGlobalShortcuts, useHelpShortcut } from './shortcuts';
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
  useHelpShortcut();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-sm text-fg">
      <SkipLink />
      <RealModeNotice />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main id={MAIN_ID} tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none">
          <ErrorBoundary resetKey={pathname}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-fg-muted">
                  <Spinner size={20} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        {showsRightRail(pathname) ? <RightRail /> : null}
      </div>
      <ShortcutsHelpDialog />
    </div>
  );
}
