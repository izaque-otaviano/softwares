import { useMemo } from 'react';
import { StatusBadge, Table, type ColumnDef, type SortState, type TableErrorConfig } from '@/components/ui';
import type { MenuItemSpec } from '@/components/ui';
import { PRIORITY_LABEL, TYPE_LABEL } from '@/lib/status';
import { relativeTime } from '@/lib/time';
import type { Ticket } from '@/types/domain';
import { cellText, columnMeta, groupLabelText, categoryOf, statusOf, type Lookups } from './viewQuery';

export interface TicketTableProps {
  tableId: string;
  rows: Ticket[];
  columnIds: string[];
  lookups: Lookups;
  now: Date;
  sort: SortState | null;
  onSortChange: (s: SortState | null) => void;
  grouped: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  loading?: boolean;
  error?: TableErrorConfig;
  onOpen: (t: Ticket) => void;
  rowActions: (t: Ticket) => MenuItemSpec[];
}

const WIDTH: Record<string, number> = { status: 130, id: 72, subject: 210, requester: 140, createdAt: 140, updatedAt: 140, type: 100, priority: 100, assignee: 170, group: 130 };
const SORTABLE = new Set(['status', 'id', 'subject', 'requester', 'createdAt', 'updatedAt', 'type', 'priority', 'assignee', 'group']);

/** Tabela de tickets de uma visualização: apenas apresentação (ordenar/filtrar é feito por quem chama). */
export function TicketTable(props: TicketTableProps) {
  const { rows, columnIds, lookups, now, grouped } = props;

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () =>
      columnIds.flatMap((id): ColumnDef<Ticket>[] => {
        const meta = columnMeta(id);
        if (!meta) return [];
        const base = { id, header: meta.label, label: meta.label, sortable: SORTABLE.has(id), width: WIDTH[id] ?? 140 };
        switch (id) {
          case 'status':
            return [{ ...base, cell: (t: Ticket) => <StatusBadge status={statusOf(t, lookups.statuses)} label={cellText(t, 'status', lookups)} /> }];
          case 'subject':
            return [{ ...base, cell: (t: Ticket) => <span title={t.subject}>{t.subject}</span> }];
          case 'createdAt':
          case 'updatedAt':
            return [{ ...base, cell: (t: Ticket) => relativeTime(id === 'createdAt' ? t.createdAt : t.updatedAt, now) }];
          case 'type':
            return [{ ...base, cell: (t: Ticket) => (t.type ? TYPE_LABEL[t.type] : '-') }];
          case 'priority':
            return [{ ...base, cell: (t: Ticket) => (t.priority ? PRIORITY_LABEL[t.priority] : '-') }];
          case 'id':
            return [{ ...base, cell: (t: Ticket) => `#${t.id}` }];
          default:
            return [{ ...base, cell: (t: Ticket) => cellText(t, id, lookups) || '-' }];
        }
      }),
    [columnIds, lookups, now],
  );

  return (
    <Table<Ticket>
      id={props.tableId}
      aria-label="Tickets da visualização"
      columns={columns}
      rows={rows}
      getRowId={(t) => String(t.id)}
      getRowLabel={(t) => `Ticket #${t.id}`}
      loading={props.loading}
      error={props.error}
      empty={{ illustration: 'box', title: 'Nenhum ticket nesta visualização' }}
      sort={props.sort}
      onSortChange={props.onSortChange}
      selectable
      selectedIds={props.selectedIds}
      onSelectionChange={props.onSelectionChange}
      groupBy={grouped ? (t) => { const c = categoryOf(t, lookups.statuses); return { key: c, label: groupLabelText(c) }; } : undefined}
      rowActions={props.rowActions}
      onRowClick={props.onOpen}
      resizable
      stickyHeader
      className="h-full"
    />
  );
}
