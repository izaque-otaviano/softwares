import { Pill, Table, type ColumnDef } from '@/components/ui';
import type { AccessEvent } from '@/types/admin-b';
import { dateTime } from '../audit/format';

const columns: ColumnDef<AccessEvent>[] = [
  { id: 'createdAt', header: 'Quando', label: 'Quando', width: 160, cell: (e) => dateTime(e.createdAt) },
  { id: 'label', header: 'Evento', label: 'Evento', width: 200, cell: (e) => (e.success ? e.label : <Pill tone="danger">{e.label}</Pill>) },
  { id: 'browser', header: 'Dispositivo', label: 'Dispositivo', width: 220, cell: (e) => e.browser || '—' },
  { id: 'ip', header: 'Endereço IP', label: 'Endereço IP', width: 150, cell: (e) => e.ip || '—' },
];

export function AccessEventsTable({ events, loading, error, id, ...rest }: { events: AccessEvent[]; loading?: boolean; error?: { message: string; onRetry: () => void }; id: string; 'aria-label': string }) {
  return (
    <Table<AccessEvent>
      id={id}
      aria-label={rest['aria-label']}
      columns={columns}
      rows={events}
      getRowId={(e) => `${e.createdAt}-${e.kind}-${e.browser}`}
      getRowLabel={(e) => `${e.label}, ${dateTime(e.createdAt)}`}
      loading={loading}
      error={error}
      empty={{ title: 'Nenhum evento registrado' }}
    />
  );
}
