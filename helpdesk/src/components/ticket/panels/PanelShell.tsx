import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Verdadeiro quando o painel está dentro de um Drawer (abaixo de 1024 px): ocupa a largura toda e o título fica no Drawer. */
export const PanelInDrawerContext = createContext(false);

/** Moldura de um painel direito: cabeçalho com título + ações e corpo rolável. */
export function PanelShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const inDrawer = useContext(PanelInDrawerContext);
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col overflow-hidden bg-surface', inDrawer ? 'h-full w-full' : 'w-right shrink-0 border-l border-line')}
    >
      <header className={cn('h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-4', inDrawer ? 'hidden has-[button]:flex' : 'flex')}>
        <h2 className={cn('truncate text-sm font-semibold text-fg', inDrawer && 'sr-only')}>{title}</h2>
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
