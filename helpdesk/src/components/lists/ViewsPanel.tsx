import { ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { SecondaryPanel } from '@/components/shell/SecondaryPanel';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ViewCounts } from '@/store/useTickets';
import type { View } from '@/types/domain';

export interface ViewsPanelProps {
  views: View[];
  counts: ViewCounts;
  activeId?: string;
  onNew: () => void;
  onRefresh: () => void;
}

/** Painel secundário de /agent/views: 6 views com contador (“-” enquanto carrega). */
export function ViewsPanel({ views, counts, activeId, onNew, onRefresh }: ViewsPanelProps) {
  return (
    <SecondaryPanel
      pageKey="views"
      width={330}
      footer={
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-fg-muted">
            <span>Tickets suspensos</span>
            <span>0</span>
          </div>
          <div className="flex items-center justify-between text-fg-muted">
            <span>Tickets apagados</span>
            <span>0</span>
          </div>
          <a href="#gerenciar-visualizacoes" onClick={(e) => e.preventDefault()} className="mt-1 inline-flex items-center gap-1 text-action hover:text-action-hover hover:underline">
            Gerenciar visualizações <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      }
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-md font-semibold text-fg">Visualizações</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Nova visualização" icon={<Plus />} size="sm" onClick={onNew} />
          <IconButton label="Atualizar contadores" icon={<RefreshCw />} size="sm" onClick={onRefresh} />
        </div>
      </div>
      <nav aria-label="Visualizações" className="flex flex-col gap-0.5 px-2 pb-2">
        {views.map((v) => {
          const count = counts[v.countKey];
          return (
            <NavLink
              key={v.id}
              to={`/agent/views/${v.id}`}
              aria-current={activeId === v.id ? 'page' : undefined}
              className={cn(
                'flex min-h-8 items-center justify-between gap-2 rounded px-2 py-1 text-sm transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus focus-visible:outline-none',
                activeId === v.id ? 'bg-ink-active text-fg-inverse hover:bg-ink-active' : 'text-fg',
              )}
            >
              <span className="min-w-0 truncate">{v.name}</span>
              <span className={cn('shrink-0 text-xs', activeId === v.id ? 'text-fg-inverse' : 'text-fg-muted')} aria-label={count == null ? 'carregando' : `${count} tickets`}>
                {count == null ? '-' : count}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </SecondaryPanel>
  );
}
