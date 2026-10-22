import { Suspense, useState, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { AdminRail, AdminSecondaryNav } from './AdminNav';
import { AdminTopBar } from './AdminTopBar';
import { Copilot } from './Copilot';

/** Casca da administração: 100vh, TopBar, rail, painel secundário e conteúdo rolável. */
export function AdminShell({ children }: { children: ReactNode }) {
  const [copilotOpen, setCopilotOpen] = useState(false);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-sm text-fg">
      <AdminTopBar copilotOpen={copilotOpen} onCopilotToggle={() => setCopilotOpen((o) => !o)} />
      <div className="flex min-h-0 flex-1">
        <AdminRail />
        <AdminSecondaryNav />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-fg-muted">
                <Spinner size={20} />
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
      <Copilot open={copilotOpen} onOpenChange={setCopilotOpen} />
    </div>
  );
}
