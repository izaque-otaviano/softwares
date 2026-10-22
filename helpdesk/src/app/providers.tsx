import type { ReactNode } from 'react';
import { ToastViewport } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';

/** Providers globais: tooltips e a região de toasts (lê a store `useUi`). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <ToastViewport />
    </TooltipProvider>
  );
}
