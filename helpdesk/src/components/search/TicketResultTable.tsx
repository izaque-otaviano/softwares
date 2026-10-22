import { useMemo } from 'react';
import { openTicket } from '@/components/shell/openTab';
import { cellText, columnMeta, statusOf, type Lookups } from '@/components/lists/viewQuery';
import { StatusBadge, Table, type ColumnDef, type SortState, type TableErrorConfig } from '@/components/ui';
import { relativeTime } from '@/lib/time';
import type { Ticket } from '@/types/domain';

export const SEARCH_COLUMNS = ['status', 'id', 'subject', 'createdAt', 'updatedAt', 'requester', 'assignee', 'group'];
const LABEL: Record<string, string> = { status: 'Status', updatedAt: 'Data da atualização', assignee: 'Atribuído' };
const WIDTH: Record<string, number> = { status: 130, id: 72, subject: 260, createdAt: 160, updatedAt: 160, requester: 160, assignee: 160, group: 130, type: 100, priority: 100 };

export interface TicketResultTableProps {
  rows: Ticket[];
  columnIds: string[];
  lookups: Lookups;
  now: Date;
  sort: SortState | null;
  onSortChange: (s: SortState | null) => void;
  loading?: boolean;
  error?: TableErrorConfig;
  emptyDescription?: string;
}

/** Tabela de tickets da página de busca; clicar numa linha abre (ou foca) a aba do ticket. */
export function TicketResultTable(p: TicketResultTableProps) {
  const { columnIds, lookups, now } = p;
  const columns = useMemo<ColumnDef<Ticket>[]>(
    () =>
      columnIds.flatMap((id): ColumnDef<Ticket>[] => {
        const meta = columnMeta(id);
        if (!meta) return [];
        const label = LABEL[id] ?? meta.label;
        const base = { id, header: label, label, sortable: true, width: WIDTH[id] ?? 140 };
        switch (id) {
          case 'status':
            return [{ ...base, cell: (t: Ticket) => <StatusBadge status={statusOf(t, lookups.statuses)} label={cellText(t, 'status', lookups)} /> }];
          case 'id':
            return [{ ...base, cell: (t: Ticket) => `#${t.id}` }];
          case 'subject':
            return [{ ...base, cell: (t: Ticket) => <span title={t.subject}>{t.subject}</span> }];
          case 'createdAt':
          case 'updatedAt':
            return [{ ...base, cell: (t: Ticket) => relativeTime(id === 'createdAt' ? t.createdAt : t.updatedAt, now) }];
          default:
            return [{ ...base, cell: (t: Ticket) => cellText(t, id, lookups) || '-' }];
        }
      }),
    [columnIds, lookups, now],
  );
  return (
    <Table<Ticket>
      id="search-tickets"
      aria-label="Tickets encontrados"
      columns={columns}
      rows={p.rows}
      getRowId={(t) => String(t.id)}
      getRowLabel={(t) => `Ticket #${t.id}`}
      loading={p.loading}
      error={p.error}
      empty={{ illustration: 'search', title: 'Nenhum ticket encontrado', description: p.emptyDescription }}
      sort={p.sort}
      onSortChange={p.onSortChange}
      onRowClick={(t) => openTicket(t.id)}
      resizable
      stickyHeader
      className="h-full"
    />
  );
}
