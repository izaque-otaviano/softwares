import { useMemo } from 'react';
import { Pill, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import type { AccountSession } from '@/types/admin-b';
import { dateTime } from '../audit/format';

export interface SessionsTableProps {
  sessions: AccountSession[];
  loading?: boolean;
  error?: { message: string; onRetry: () => void };
  /** Sem isto a tabela é só de leitura. A sessão atual nunca tem a ação. */
  onRevoke?: (session: AccountSession) => void;
  'aria-label': string;
  id: string;
}

/** Sessões abertas de uma conta. O endereço IP só aparece porque o backend o entrega. */
export function SessionsTable({ sessions, loading, error, onRevoke, id, ...rest }: SessionsTableProps) {
  const columns: ColumnDef<AccountSession>[] = useMemo(
    () => [
      {
        id: 'browser',
        header: 'Dispositivo',
        label: 'Dispositivo',
        width: 240,
        cell: (s) => (
          <span className="flex items-center gap-2">
            <span className="truncate">{s.browser}</span>
            {s.current ? <Pill tone="action">Este dispositivo</Pill> : null}
          </span>
        ),
      },
      { id: 'ip', header: 'Endereço IP', label: 'Endereço IP', width: 150, cell: (s) => s.ip || '—' },
      { id: 'startedAt', header: 'Iniciada em', label: 'Iniciada em', width: 160, cell: (s) => dateTime(s.startedAt) },
      { id: 'expiresAt', header: 'Expira em', label: 'Expira em', width: 160, cell: (s) => dateTime(s.expiresAt) },
    ],
    [],
  );
  const rowActions = onRevoke
    ? (s: AccountSession): MenuItemSpec[] => (s.current ? [] : [{ id: 'revoke', label: 'Encerrar sessão', tone: 'danger', onSelect: () => onRevoke(s) }])
    : undefined;
  return (
    <Table<AccountSession>
      id={id}
      aria-label={rest['aria-label']}
      columns={columns}
      rows={sessions}
      getRowId={(s) => s.key}
      getRowLabel={(s) => `Sessão em ${s.browser}`}
      loading={loading}
      error={error}
      rowActions={rowActions}
      empty={{ title: 'Nenhuma sessão aberta' }}
    />
  );
}
