import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Columns3, ListFilter, Play, Square } from 'lucide-react';
import { openTicket } from '@/components/shell/openTab';
import { BulkBar } from '@/components/lists/BulkBar';
import { ColumnsDrawer } from '@/components/lists/ColumnsDrawer';
import { FilterDrawer } from '@/components/lists/FilterDrawer';
import { TicketTable } from '@/components/lists/TicketTable';
import { usePlayQueue } from '@/components/lists/usePlayQueue';
import { useDirectory } from '@/components/lists/useDirectory';
import { columnsOf, filtersOf, useViewPrefs } from '@/components/lists/useViewPrefs';
import { ViewActions } from '@/components/lists/ViewActions';
import { ViewsPanel } from '@/components/lists/ViewsPanel';
import {
  applyFilters,
  buildCsv,
  countActiveFilters,
  downloadCsv,
  sortTickets,
  type Lookups,
} from '@/components/lists/viewQuery';
import { Button, ConfirmModal, Input, Modal, type MenuItemSpec, type SortState } from '@/components/ui';
import { useNow } from '@/lib/useNow';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import type { Ticket, View } from '@/types/domain';

type Dialog = null | 'new' | 'edit' | 'clone';

export default function Views() {
  const { id } = useParams();
  const views = useTickets((s) => s.views);
  const counts = useTickets((s) => s.counts);
  const loaded = useTickets((s) => s.loaded);
  const loading = useTickets((s) => s.loading);
  const error = useTickets((s) => s.error);
  const [dialog, setDialog] = useState<Dialog>(null);
  const viewId = id ?? views[0]?.id ?? 'mine';
  const view = views.find((v) => v.id === viewId);

  useEffect(() => {
    if (!loaded && !loading && !error) void useTickets.getState().load();
  }, [loaded, loading, error]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <ViewsPanel
        views={views}
        counts={counts}
        activeId={viewId}
        onNew={() => setDialog('new')}
        onRefresh={() => void useTickets.getState().refreshCounts()}
      />
      <main className="flex min-w-0 flex-1 flex-col bg-surface" aria-label="Visualização">
        {view ? (
          <ViewContent key={view.id} view={view} dialog={dialog} setDialog={setDialog} />
        ) : (
          <div className="p-6 text-sm text-fg-muted">Visualização não encontrada.</div>
        )}
      </main>
      <Modal
        open={dialog === 'new'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Nova visualização"
        description="A criação de visualizações personalizadas ainda não está disponível neste protótipo."
        size="sm"
        footer={<Button variant="outline" onClick={() => setDialog(null)}>Fechar</Button>}
      />
    </div>
  );
}

function ViewContent({ view, dialog, setDialog }: { view: View; dialog: Dialog; setDialog: (d: Dialog) => void }) {
  const viewId = view.id;
  const tickets = useTickets((s) => s.tickets);
  const statuses = useTickets((s) => s.statuses);
  const views = useTickets((s) => s.views);
  const loaded = useTickets((s) => s.loaded);
  const error = useTickets((s) => s.error);
  const users = useDirectory();
  const now = useNow(60_000);

  const filters = useViewPrefs((s) => filtersOf(s, viewId));
  const columnIds = useViewPrefs((s) => columnsOf(s, viewId, view.columns));
  const sort = useViewPrefs((s) => s.sort[viewId] ?? null);
  const grouped = useViewPrefs((s) => s.grouped[viewId] ?? view.groupBy === 'statusCategory');
  const prefs = useViewPrefs.getState();

  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [name, setName] = useState(view.name);

  const lookups = useMemo<Lookups>(() => ({ statuses, users }), [statuses, users]);

  const rows = useMemo(() => {
    // `views` entra nas dependências: `ticketsForView` lê a store, que muda junto.
    const base = useTickets.getState().ticketsForView(viewId);
    return sortTickets(applyFilters(base, filters), sort, lookups, grouped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, statuses, views, viewId, filters, sort, lookups, grouped]);

  // Remove da seleção o que saiu da lista (apagado, filtrado, mudou de view).
  useEffect(() => {
    setSelected((prev) => {
      const present = new Set(rows.map((t) => String(t.id)));
      const next = new Set([...prev].filter((x) => present.has(x)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const requesters = useMemo(() => [...users.values()].filter((u) => u.role === 'end_user'), [users]);
  const tagSuggestions = useMemo(() => [...new Set(tickets.flatMap((t) => t.tags))].sort(), [tickets]);
  const activeFilters = countActiveFilters(filters);
  const isLoading = !loaded && !error;
  const play = usePlayQueue();

  const sortState: SortState | null = sort;
  const open = useCallback((t: Ticket) => openTicket(t.id), []);

  const exportCsv = () => {
    downloadCsv(`${view.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.csv`, buildCsv(rows, columnIds, lookups));
    toast.success(`${rows.length} ${rows.length === 1 ? 'ticket exportado' : 'tickets exportados'}`);
  };

  const rowActions = (t: Ticket): MenuItemSpec[] => [
    { id: 'open', label: 'Abrir ticket', onSelect: () => openTicket(t.id) },
    { id: 'assign', label: 'Atribuir a mim', onSelect: () => void useTickets.getState().assignToMe([t.id]) },
    { id: 'solve', label: 'Marcar como resolvido', onSelect: () => void useTickets.getState().setStatus([t.id], 'solved') },
    { id: 'delete', label: 'Apagar', tone: 'danger', onSelect: () => setDeleteId(t.id) },
  ];

  const startPlay = () => {
    const first = play.start(viewId, rows.map((t) => t.id));
    if (first !== null) openTicket(first);
  };
  const playing = play.viewId === viewId;

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-6 pb-3 pt-5">
        <h1 className="min-w-0 truncate text-xl font-normal text-fg">{view.name}</h1>
        <ViewActions
          grouped={grouped}
          onGroupedChange={(g) => prefs.setGrouped(viewId, g)}
          onExport={exportCsv}
          onEdit={() => { setName(view.name); setDialog('edit'); }}
          onClone={() => { setName(`${view.name} (cópia)`); setDialog('clone'); }}
          onResetColumns={() => prefs.resetColumns(viewId)}
          onPlay={startPlay}
          canPlay={rows.length > 0}
        />
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 pb-3">
        <Button variant="outline" leadingIcon={<ListFilter />} onClick={() => setFilterOpen(true)}>
          {activeFilters > 0 ? `Filtrar (${activeFilters})` : 'Filtrar'}
        </Button>
        <Button variant="outline" leadingIcon={<Columns3 />} onClick={() => setColumnsOpen(true)}>
          Colunas
        </Button>
        {activeFilters > 0 ? (
          <button type="button" className="rounded text-sm text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => prefs.setFilters(viewId, { ...filters, tags: [], statusIds: [], subject: '', requesterId: null, datePreset: 'any', from: '', to: '', type: 'any', priority: 'any' })}>
            Limpar filtros
          </button>
        ) : null}
        <p className="text-sm text-fg-muted" aria-live="polite">
          {isLoading ? 'Carregando tickets…' : `${rows.length} ${rows.length === 1 ? 'ticket' : 'tickets'} · Última atualização agora mesmo`}
        </p>
      </div>

      {playing ? (
        <div className="flex items-center gap-3 border-b border-line bg-action-soft px-6 py-2 text-sm">
          <Play className="h-4 w-4 text-action" aria-hidden />
          <span>Reproduzindo: ticket {play.index + 1} de {play.ids.length}</span>
          <Button variant="outline" onClick={() => { const n = play.next(); if (n !== null) openTicket(n); }}>Próximo</Button>
          <Button variant="ghost" leadingIcon={<Square />} onClick={() => play.stop()}>Parar</Button>
        </div>
      ) : null}

      {selected.size > 0 ? <BulkBar ids={[...selected].map(Number)} onClear={() => setSelected(new Set())} /> : null}

      <div className="min-h-0 flex-1">
        <TicketTable
          tableId={`views-${viewId}`}
          rows={isLoading || error ? [] : rows}
          columnIds={columnIds}
          lookups={lookups}
          now={now}
          sort={sortState}
          onSortChange={(s) => prefs.setSort(viewId, s)}
          grouped={grouped}
          selectedIds={selected}
          onSelectionChange={setSelected}
          loading={isLoading}
          error={error && !loaded ? { message: 'Não foi possível carregar os tickets. Tente novamente.', onRetry: () => void useTickets.getState().load() } : undefined}
          onOpen={open}
          rowActions={rowActions}
        />
      </div>

      <FilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={(f) => prefs.setFilters(viewId, f)}
        statuses={statuses}
        requesters={requesters}
        tagSuggestions={tagSuggestions}
      />
      <ColumnsDrawer open={columnsOpen} onOpenChange={setColumnsOpen} value={columnIds} onApply={(c) => prefs.setColumns(viewId, c)} />

      <ConfirmModal
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={`Apagar ticket #${deleteId}?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Apagar"
        onConfirm={async () => {
          if (deleteId !== null) await useTickets.getState().deleteTickets([deleteId]);
          setDeleteId(null);
        }}
      />

      <Modal
        open={dialog === 'edit' || dialog === 'clone'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'clone' ? 'Clonar visualização' : 'Editar visualização'}
        description="No protótipo só o nome pode ser alterado; as condições seguem as da visualização original."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={name.trim() === ''}
              onClick={() => {
                toast.success(dialog === 'clone' ? `Visualização “${name.trim()}” clonada` : 'Visualização atualizada');
                setDialog(null);
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-xs font-semibold text-fg-muted" htmlFor="view-name">Nome da visualização</label>
        <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </>
  );
}
