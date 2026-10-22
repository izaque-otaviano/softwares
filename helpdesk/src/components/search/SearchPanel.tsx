import { SecondaryPanel } from '@/components/shell/SecondaryPanel';
import { cn } from '@/lib/cn';

export type SearchType = 'tickets' | 'articles' | 'users' | 'orgs' | 'chats';

export const SEARCH_TYPES: { id: SearchType; label: string; title: string }[] = [
  { id: 'tickets', label: 'Tickets', title: 'Tickets' },
  { id: 'articles', label: 'Artigos', title: 'Artigos' },
  { id: 'users', label: 'Usuários', title: 'Usuários' },
  { id: 'orgs', label: 'Organizações', title: 'Organizações' },
  { id: 'chats', label: 'Conversas paralelas', title: 'Conversas paralelas' },
];

export interface SearchPanelProps {
  active: SearchType;
  onChange: (t: SearchType) => void;
  /** `undefined` enquanto carrega (mostra "-"). */
  counts: Partial<Record<SearchType, number>> | null;
}

/** Painel secundário "Pesquisar": Filtrar por (com contadores) e Pesquisas salvas. */
export function SearchPanel({ active, onChange, counts }: SearchPanelProps) {
  return (
    <SecondaryPanel pageKey="search" width={240} title="Pesquisar">
      <section aria-labelledby="search-filter-by" className="px-2 pb-3">
        <h3 id="search-filter-by" className="px-2 pb-1 pt-2 text-xs font-semibold text-fg-muted">
          Filtrar por
        </h3>
        <nav aria-label="Filtrar por" className="flex flex-col gap-0.5">
          {SEARCH_TYPES.map((t) => {
            const n = counts?.[t.id];
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active === t.id ? 'true' : undefined}
                onClick={() => onChange(t.id)}
                className={cn(
                  'flex min-h-8 items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm outline-none transition-colors duration-100 focus-visible:shadow-focus',
                  active === t.id ? 'bg-ink-active text-fg-inverse' : 'text-fg hover:bg-hover',
                )}
              >
                <span className="min-w-0 truncate">{t.label}</span>
                <span className={cn('shrink-0 text-xs', active === t.id ? 'text-fg-inverse' : 'text-fg-muted')} aria-label={n === undefined ? 'carregando' : `${n} resultados`}>
                  {n === undefined ? '-' : n}
                </span>
              </button>
            );
          })}
        </nav>
      </section>
      <section aria-labelledby="search-saved" className="border-t border-line px-4 py-3">
        <h3 id="search-saved" className="pb-1 text-xs font-semibold text-fg-muted">
          Pesquisas salvas
        </h3>
        <p className="text-sm text-fg-muted">Nenhuma pesquisa salva</p>
      </section>
    </SecondaryPanel>
  );
}
