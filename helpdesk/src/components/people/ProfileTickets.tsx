import { ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDirectory } from '@/components/lists/useDirectory';
import { GROUP_NAMES, sortTickets, statusOf, userName, type Lookups } from '@/components/lists/viewQuery';
import { openTicket } from '@/components/shell/openTab';
import { Button, Input, Select, StatusBadge, Table, type ColumnDef, type SortState } from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { relativeTime } from '@/lib/time';
import { useTickets } from '@/store/useTickets';
import type { Ticket } from '@/types/domain';

export interface ProfileTicketsProps {
  /** Id usado para persistir larguras da tabela e nomear regiões. */
  tableId: string;
  requested: Ticket[];
  /** Tickets em que a pessoa está em cópia (só cliente). Sem isto não há seletor de tipo. */
  cc?: Ticket[];
  loading?: boolean;
  error?: { message: string; onRetry: () => void };
}

type Scope = 'requested' | 'cc';

/** Seletor "Tickets solicitados (n)", filtro e tabela de tickets de um cliente ou organização. */
export function ProfileTickets({ tableId, requested, cc, loading, error }: ProfileTicketsProps) {
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const users = useDirectory();
  const [scope, setScope] = useState<Scope>('requested');
  const [filterOpen, setFilterOpen] = useState(false);
  const [text, setText] = useState('');
  const [statusId, setStatusId] = useState('');
  const [sort, setSort] = useState<SortState | null>({ columnId: 'updatedAt', direction: 'desc' });
  const lookups = useMemo<Lookups>(() => ({ statuses, users }), [statuses, users]);

  const base = scope === 'cc' && cc ? cc : requested;
  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    const filtered = base.filter((t) => (!q || t.subject.toLowerCase().includes(q) || String(t.id) === q.replace('#', '')) && (!statusId || t.statusId === statusId));
    return sortTickets(filtered, sort, lookups);
  }, [base, text, statusId, sort, lookups]);

  const now = new Date();
  const columns: ColumnDef<Ticket>[] = [
    { id: 'status', header: 'Status', label: 'Status', sortable: true, width: 130, cell: (t) => <StatusBadge status={statusOf(t, statuses)} label={statusOf(t, statuses)?.agentName ?? t.statusId} /> },
    { id: 'id', header: 'ID', label: 'ID', sortable: true, width: 72, cell: (t) => `#${t.id}` },
    { id: 'subject', header: 'Assunto', label: 'Assunto', sortable: true, width: 240, cell: (t) => <span title={t.subject}>{t.subject}</span> },
    { id: 'createdAt', header: 'Data da solicitação', label: 'Data da solicitação', sortable: true, width: 160, cell: (t) => relativeTime(t.createdAt, now) },
    { id: 'updatedAt', header: 'Data da atualização', label: 'Data da atualização', sortable: true, width: 160, cell: (t) => relativeTime(t.updatedAt, now) },
    { id: 'group', header: 'Grupo', label: 'Grupo', sortable: true, width: 120, cell: (t) => GROUP_NAMES[t.assigneeGroupId] ?? t.assigneeGroupId },
    { id: 'assignee', header: 'Atribuído', label: 'Atribuído', sortable: true, width: 160, cell: (t) => userName(users, t.assigneeId) || '-' },
  ];

  const activeFilters = (text.trim() ? 1 : 0) + (statusId ? 1 : 0);

  return (
    <section aria-label="Tickets" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 py-3">
        {cc ? (
          <Select
            aria-label="Tipo de ticket"
            className="w-60"
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
            options={[
              { value: 'requested', label: `Tickets solicitados (${requested.length})` },
              { value: 'cc', label: `Tickets em cópia (${cc.length})` },
            ]}
          />
        ) : (
          <h2 className="text-sm font-semibold text-fg">Tickets solicitados ({requested.length})</h2>
        )}
        <Button variant="outline" leadingIcon={<ListFilter />} aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>
          {activeFilters ? `Filtrar (${activeFilters})` : 'Filtrar'}
        </Button>
        {filterOpen ? (
          <>
            <Input aria-label="Filtrar por assunto ou ID" placeholder="Assunto ou ID" className="w-56" value={text} onChange={(e) => setText(e.target.value)} />
            <Select
              aria-label="Filtrar por status"
              className="w-44"
              value={statusId}
              onValueChange={setStatusId}
              options={[{ value: '', label: 'Todos os status' }, ...statuses.map((s) => ({ value: s.id, label: s.agentName }))]}
            />
            {activeFilters ? (
              <Button variant="ghost" onClick={() => { setText(''); setStatusId(''); }}>
                Limpar
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <Table<Ticket>
          id={tableId}
          aria-label="Tickets"
          columns={columns}
          rows={loading || error ? [] : rows}
          getRowId={(t) => String(t.id)}
          getRowLabel={(t) => `Ticket #${t.id}`}
          loading={loading}
          error={error}
          empty={{ illustration: 'box', title: activeFilters ? 'Nenhum ticket com esses filtros' : 'Nenhum ticket por aqui' }}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(t) => openTicket(t.id)}
          resizable
          stickyHeader
          className="h-full"
        />
      </div>
    </section>
  );
}
