import { useMemo, useState } from 'react';
import { getAuditLog, listAuditLogs } from '@/api/audit';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Drawer, Field, Input, Select, Skeleton, Table, type ColumnDef } from '@/components/ui';
import type { AuditLogEntry } from '@/types/admin-b';
import { actionLabel, AUDIT_ACTION_OPTIONS } from './actions';
import { DetailList } from './DetailList';
import { dateTime } from './format';
import { Pager } from './Pager';
import { usePaged } from './usePaged';
import { UserPicker } from './UserPicker';

const PAGE = 25;

/** Alterações registradas no sistema: filtros (a partir de, pessoa, ação), paginação do servidor e detalhe em gaveta. */
export function AuditLogsPanel() {
  const [from, setFrom] = useState('');
  const [actor, setActor] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<AuditLogEntry | null>(null);
  const key = JSON.stringify({ from, actor, action });
  const { page, loading, error, offset, setOffset, reload } = usePaged(
    (o) => listAuditLogs({ limit: PAGE, offset: o, from: from || undefined, actor: actor ?? undefined, action: action || undefined }),
    key,
  );

  const columns: ColumnDef<AuditLogEntry>[] = useMemo(
    () => [
      { id: 'createdAt', header: 'Quando', label: 'Quando', width: 150, cell: (l) => dateTime(l.createdAt) },
      { id: 'actor', header: 'Quem', label: 'Quem', width: 180, cell: (l) => l.actorName },
      { id: 'action', header: 'Ação', label: 'Ação', width: 170, cell: (l) => actionLabel(l.action) },
      { id: 'target', header: 'Objeto', label: 'Objeto', width: 150, cell: (l) => `${l.targetLabel} #${l.objectId}` },
      { id: 'summary', header: 'Resumo', label: 'Resumo', width: 420, cell: (l) => l.summary || '—' },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="A partir de">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </Field>
        <Field label="Quem fez">
          <UserPicker value={actor} onChange={setActor} aria-label="Filtrar por usuário" className="w-56" />
        </Field>
        <Field label="Ação">
          <Select aria-label="Filtrar por ação" value={action} onValueChange={setAction} options={AUDIT_ACTION_OPTIONS} className="w-56" />
        </Field>
      </div>
      <p className="-mt-1 mb-3 text-xs text-fg-muted">O filtro de data vai da data escolhida até agora: o servidor não aceita data final.</p>
      <Table<AuditLogEntry>
        id="admin-audit-logs"
        aria-label="Registros de auditoria"
        columns={columns}
        rows={page?.items ?? []}
        getRowId={(l) => l.id}
        getRowLabel={(l) => `${actionLabel(l.action)}, ${l.targetLabel} ${l.objectId}`}
        loading={loading && !page}
        error={error && !page ? { message: error, onRetry: reload } : undefined}
        onRowClick={setOpen}
        empty={{ title: 'Nenhum registro encontrado', description: 'Ajuste os filtros.' }}
      />
      {error && page ? (
        <div className="pt-3">
          <Banner tone="error" onRetry={reload}>
            {error}
          </Banner>
        </div>
      ) : null}
      {page ? <Pager total={page.total} limit={page.limit} offset={offset} onOffset={setOffset} loading={loading} label="Paginação dos registros" /> : null}
      <AuditLogDrawer entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ChangesList({ changes }: { changes: Record<string, unknown> }) {
  const rows = Object.entries(changes);
  if (rows.length === 0) return <p className="text-sm text-fg-muted">Sem alterações de campos registradas.</p>;
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(vazio)' : typeof v === 'string' ? v : JSON.stringify(v));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map(([field, value]) => {
        const pair = Array.isArray(value) && value.length === 2 ? value : null;
        return (
          <li key={field} className="rounded border border-line p-2">
            <span className="font-semibold text-fg">{field}</span>
            <div className="mt-1 text-fg-muted">{pair ? `${show(pair[0])} → ${show(pair[1])}` : show(value)}</div>
          </li>
        );
      })}
    </ul>
  );
}

function AuditLogDrawer({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  return (
    <Drawer open={entry !== null} onOpenChange={(o) => !o && onClose()} title="Detalhe do registro" description={entry ? `Registro #${entry.id}` : undefined}>
      {entry ? <AuditLogBody key={entry.id} entry={entry} /> : null}
    </Drawer>
  );
}

function AuditLogBody({ entry }: { entry: AuditLogEntry }) {
  const detail = useAsync(() => getAuditLog(entry.id));
  // A linha da lista serve de primeira pintura; o detalhe do servidor a completa.
  const current = detail.data ?? entry;
  return (
    <div className="space-y-5">
      <DetailList
        items={[
          { label: 'Quando', value: dateTime(current.createdAt) },
          { label: 'Quem', value: current.actorName },
          { label: 'Ação', value: actionLabel(current.action) },
          { label: 'Objeto', value: `${current.targetLabel} #${current.objectId}` },
          { label: 'Resumo', value: current.summary },
          { label: 'Endereço IP', value: current.ip },
        ]}
      />
      <section aria-labelledby="audit-changes">
        <h3 id="audit-changes" className="mb-2 text-sm font-semibold text-fg">
          Campos alterados
        </h3>
        {detail.loading && !detail.data ? <Skeleton height={32} /> : <ChangesList changes={current.changes} />}
        {detail.error ? <p className="mt-2 text-sm text-danger">{detail.error}</p> : null}
      </section>
    </div>
  );
}
