import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Moldura de um painel direito: cabeçalho com título + ações e corpo rolável. */
export function PanelShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex w-right shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** Seção recolhível dentro de um painel. */
export function SectionHeader({
  title,
  expanded,
  onToggle,
  actions,
  className,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="text-xs font-semibold text-fg">{title}</h3>
      <div className="flex items-center gap-1">
        {actions}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="rounded px-1 text-xs text-action outline-none hover:underline focus-visible:shadow-focus"
        >
          {expanded ? 'Recolher' : 'Expandir'}
          <span className="sr-only"> {title}</span>
        </button>
      </div>
    </div>
  );
}
