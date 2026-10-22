import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useUi } from '@/store/useUi';

export interface SecondaryPanelProps {
  /** Chave da página (ex.: `home`, `views`, `customers`); guarda o estado em `useUi.sidebarWidths`. */
  pageKey: string;
  /** Largura expandida em px (Home 240, Views 330, Clientes 360). */
  width: number;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Coluna à esquerda do conteúdo. O botão ‹ na borda recolhe; o estado fica em `useUi.sidebarWidths[pageKey]`
 * (0 = recolhido, ausente ou > 0 = expandido) e sobrevive a recarregamentos.
 */
export function SecondaryPanel({ pageKey, width, title, footer, children }: SecondaryPanelProps) {
  const stored = useUi((s) => s.sidebarWidths[pageKey]);
  const setWidth = useUi((s) => s.setSidebarWidth);
  const collapsed = stored === 0;
  const label = typeof title === 'string' ? title : 'painel lateral';

  const toggle = (
    <button
      type="button"
      aria-label={collapsed ? `Expandir ${label}` : `Recolher ${label}`}
      aria-expanded={!collapsed}
      onClick={() => setWidth(pageKey, collapsed ? width : 0)}
      className={cn(
        'absolute top-4 z-10 inline-flex h-6 w-6 items-center justify-center rounded-pill border border-line bg-surface text-fg-muted shadow-pop outline-none',
        'hover:bg-surface-1 hover:text-fg focus-visible:shadow-focus',
        '-right-3',
      )}
    >
      {collapsed ? <ChevronRight aria-hidden className="h-4 w-4" /> : <ChevronLeft aria-hidden className="h-4 w-4" />}
    </button>
  );

  if (collapsed) {
    return (
      <aside aria-label={label} data-collapsed="true" className="relative h-full w-3 shrink-0 border-r border-line bg-surface-1">
        {toggle}
      </aside>
    );
  }

  return (
    <aside
      aria-label={label}
      data-collapsed="false"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-line bg-surface"
    >
      {toggle}
      {title ? <h2 className="shrink-0 px-4 pb-2 pt-4 text-md font-semibold text-fg">{title}</h2> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer ? <div className="shrink-0 border-t border-line px-4 py-3">{footer}</div> : null}
    </aside>
  );
}
