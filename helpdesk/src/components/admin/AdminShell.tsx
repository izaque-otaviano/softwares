import { Suspense, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/shell/ErrorBoundary';
import { MAIN_ID, SkipLink } from '@/components/a11y/SkipLink';
import { Spinner } from '@/components/ui';
import { ShortcutsHelpDialog } from '@/components/shell/ShortcutsHelp';
import { useHelpShortcut } from '@/components/shell/shortcuts';
import { RealModeNotice } from '@/components/shell/RealModeNotice';
import { AdminRail, AdminSecondaryNav } from './AdminNav';
import { AdminTopBar } from './AdminTopBar';
import { Copilot } from './Copilot';

/** Casca da administração: 100vh, TopBar, rail, painel secundário e conteúdo rolável. */
export function AdminShell({ children }: { children: ReactNode }) {
  const [copilotOpen, setCopilotOpen] = useState(false);
  useHelpShortcut();
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-sm text-fg">
      <SkipLink />
      <RealModeNotice />
      <AdminTopBar copilotOpen={copilotOpen} onCopilotToggle={() => setCopilotOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        <AdminRail />
        <AdminSecondaryNav />
        <main id={MAIN_ID} tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-auto outline-none">
          <ErrorBoundary resetKey={pathname}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-fg-muted">
                  <Spinner size={20} />
                </div>
              }
            >
              {children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <ShortcutsHelpDialog />
      <Copilot open={copilotOpen} onOpenChange={setCopilotOpen} />
    </div>
  );
}
