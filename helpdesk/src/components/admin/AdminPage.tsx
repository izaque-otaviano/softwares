import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Corpo de página de administração: mesmo recuo horizontal do PageHeader (24 px). */
export function AdminBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 pb-8 pt-4', className)}>{children}</div>;
}

/** Barra de ferramentas acima de uma tabela (busca, filtros, colunas). */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-pill bg-surface-2">
      <div className="h-full rounded-pill bg-action" style={{ width: `${pct}%` }} />
    </div>
  );
}
