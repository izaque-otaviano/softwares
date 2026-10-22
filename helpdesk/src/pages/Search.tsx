import { ChevronDown, Columns3, ListFilter, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { search } from '@/api/search';
import { useDirectory } from '@/components/lists/useDirectory';
import { ColumnsDrawer } from '@/components/lists/ColumnsDrawer';
import { FilterDrawer } from '@/components/lists/FilterDrawer';
import {
  applyFilters,
  buildCsv,
  countActiveFilters,
  downloadCsv,
  EMPTY_FILTERS,
  sortTickets,
  type Lookups,
  type ViewFilters,
} from '@/components/lists/viewQuery';
import { OrgsResultTable, UsersResultTable } from '@/components/search/PeopleTables';
import { SEARCH_TYPES, SearchPanel, type SearchType } from '@/components/search/SearchPanel';
import { renameSearchTab } from '@/components/search/searchTab';
import { SEARCH_COLUMNS, TicketResultTable } from '@/components/search/TicketResultTable';
import { useOrgs } from '@/components/ticket/useTicketLookups';
import { Banner, Button, EmptyState, IconButton, Input, Menu, MenuContent, MenuItem, MenuTrigger, type SortState } from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import type { SearchResults } from '@/types/domain';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: SearchResults };

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(q);
  const [type, setType] = useState<SearchType>('tickets');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<ViewFilters>(EMPTY_FILTERS);
  const [columnIds, setColumnIds] = useState<string[]>(SEARCH_COLUMNS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const users = useDirectory();
  const orgs = useOrgs();
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const now = useNow(60_000);

  useEffect(() => setDraft(q), [q]);

  useEffect(() => {
    if (!q) {
      setLoad({ state: 'ok', data: { tickets: [], users: [], orgs: [] } });
      return undefined;
    }
    let alive = true;
    setLoad({ state: 'loading' });
    search(q).then(
      (data) => alive && setLoad({ state: 'ok', data }),
      () => alive && setLoad({ state: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [q, attempt]);

  const lookups = useMemo<Lookups>(() => ({ statuses, users }), [statuses, users]);
  const data = load.state === 'ok' ? load.data : null;
  const ticketRows = useMemo(
    () => (data ? sortTickets(applyFilters(data.tickets, filters), sort, lookups) : []),
    [data, filters, sort, lookups],
  );
  const requesters = useMemo(() => [...users.values()].filter((u) => u.role === 'end_user'), [users]);
  const tagSuggestions = useMemo(() => [...new Set((data?.tickets ?? []).flatMap((t) => t.tags))].sort(), [data]);
  const activeFilters = countActiveFilters(filters);

  const counts = data ? { tickets: data.tickets.length, articles: 0, users: data.users.length, orgs: data.orgs.length, chats: 0 } : null;
  const loading = load.state === 'loading';
  const tableError = load.state === 'error' ? { message: 'Não foi possível pesquisar. Tente novamente.', onRetry: () => setAttempt((n) => n + 1) } : undefined;
  const title = SEARCH_TYPES.find((t) => t.id === type)!.title;

  const commit = (value: string) => {
    const next = value.trim();
    if (!next || next === q) return;
    renameSearchTab(q, next);
    setParams({ q: next }, { replace: true });
  };

  const exportCsv = () => {
    downloadCsv('pesquisa.csv', buildCsv(ticketRows, columnIds, lookups));
    toast.success(`${ticketRows.length} ${ticketRows.length === 1 ? 'ticket exportado' : 'tickets exportados'}`);
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <SearchPanel active={type} onChange={setType} counts={counts} />
      <section aria-label="Resultados da pesquisa" className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="px-6 pb-3 pt-5">
          <h1 className="min-w-0 truncate text-xl font-normal text-fg">{title}</h1>
          <form
            role="search"
            className="mt-3 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              commit(draft);
            }}
          >
            <Input
              aria-label="Termo da pesquisa"
              value={draft}
              leadingIcon={<SearchIcon />}
              placeholder="Pesquisar"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft)}
              trailingSlot={
                draft ? (
                  <button
                    type="button"
                    aria-label="Limpar pesquisa"
                    onClick={() => setDraft('')}
                    className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted outline-none hover:bg-hover focus-visible:shadow-focus"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                ) : null
              }
            />
          </form>
        </header>

        {type === 'tickets' ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 pb-3">
            <Button variant="outline" leadingIcon={<ListFilter />} onClick={() => setFilterOpen(true)}>
              {activeFilters > 0 ? `Filtros (${activeFilters})` : 'Filtros'}
            </Button>
            <IconButton label="Colunas" icon={<Columns3 />} variant="outline" onClick={() => setColumnsOpen(true)} />
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" trailingIcon={<ChevronDown />}>
                  Ações
                </Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem disabled={ticketRows.length === 0} onSelect={exportCsv}>
                  Exportar como CSV
                </MenuItem>
              </MenuContent>
            </Menu>
            <p className="text-sm text-fg-muted" aria-live="polite">
              {loading ? 'Pesquisando…' : `${ticketRows.length} ${ticketRows.length === 1 ? 'resultado' : 'resultados'}`}
            </p>
          </div>
        ) : (
          <div className="border-b border-line" />
        )}

        {load.state === 'error' && type !== 'tickets' ? (
          <Banner tone="error" title="Não foi possível pesquisar" className="m-6" onRetry={() => setAttempt((n) => n + 1)}>
            Tente novamente.
          </Banner>
        ) : null}

        <div className="min-h-0 flex-1">
          {!q ? (
            <EmptyState illustration="search" title="Digite um termo para pesquisar" description="Pesquise por assunto, #id, nome ou e-mail. Operadores: status:aberto, priority:alta, assignee:me." />
          ) : type === 'tickets' ? (
            <TicketResultTable
              rows={ticketRows}
              columnIds={columnIds}
              lookups={lookups}
              now={now}
              sort={sort}
              onSortChange={setSort}
              loading={loading}
              error={tableError}
              emptyDescription={`Nada encontrado para “${q}”.`}
            />
          ) : type === 'users' ? (
            load.state === 'error' ? null : <UsersResultTable rows={data?.users ?? []} orgs={orgs} loading={loading} />
          ) : type === 'orgs' ? (
            load.state === 'error' ? null : <OrgsResultTable rows={data?.orgs ?? []} loading={loading} />
          ) : type === 'articles' ? (
            <EmptyState illustration="box" title="Nenhum artigo nesta versão" description="A base de conhecimento não faz parte deste protótipo." />
          ) : (
            <EmptyState illustration="box" title="Nenhuma conversa paralela nesta versão" description="Conversas paralelas não fazem parte deste protótipo." />
          )}
        </div>
      </section>

      <FilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={setFilters}
        statuses={statuses}
        requesters={requesters}
        tagSuggestions={tagSuggestions}
      />
      <ColumnsDrawer open={columnsOpen} onOpenChange={setColumnsOpen} value={columnIds} onApply={setColumnIds} />
    </div>
  );
}
