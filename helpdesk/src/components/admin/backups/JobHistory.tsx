import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { Pill, Table, type ColumnDef, type PillTone } from '@/components/ui';
import type { BackupJob } from '@/types/admin-a';
import { formatBytes, originLabel } from './backupText';

const when = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—');
const TONE: Record<string, PillTone> = { concluido: 'neutral', erro: 'danger', rodando: 'action', pendente: 'action', cancelado: 'note' };

/** Histórico de trabalhos (backup e restauração) com o log do selecionado. */
export function JobHistory({ jobs, loading }: { jobs: BackupJob[]; loading: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = jobs.find((j) => j.id === openId);
  const columns: ColumnDef<BackupJob>[] = [
    { id: 'when', header: 'Início', label: 'Início', width: 160, cell: (j) => when(j.startedAt ?? j.createdAt) },
    { id: 'kind', header: 'Operação', label: 'Operação', width: 130, cell: (j) => (j.kind === 'restauracao' ? 'Restauração' : 'Backup') },
    { id: 'status', header: 'Resultado', label: 'Resultado', width: 130, cell: (j) => <Pill tone={TONE[j.status] ?? 'neutral'}>{j.statusLabel}</Pill> },
    { id: 'origin', header: 'Tipo', label: 'Tipo', width: 200, cell: (j) => originLabel(j.origin) },
    { id: 'who', header: 'Pedido por', label: 'Pedido por', width: 150, cell: (j) => j.requestedBy ?? 'Sistema' },
    { id: 'file', header: 'Arquivo', label: 'Arquivo', width: 260, cell: (j) => (j.fileName ? `${j.fileName}${j.sizeBytes ? ` (${formatBytes(j.sizeBytes)})` : ''}` : '—') },
    {
      id: 'log',
      header: 'Log',
      label: 'Log',
      width: 100,
      cell: (j) => (
        <button type="button" aria-expanded={openId === j.id} onClick={() => setOpenId(openId === j.id ? null : j.id)} className="rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
          {openId === j.id ? 'Ocultar' : 'Ver log'}
        </button>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <Table<BackupJob> id="admin-backup-jobs" aria-label="Histórico de backups e restaurações" columns={columns} rows={jobs} getRowId={(j) => j.id} loading={loading} empty={{ title: 'Nenhum trabalho ainda' }} />
      {open ? (
        <section aria-label={`Log do trabalho ${open.id}`} className="rounded border border-line bg-surface-1 p-3">
          {open.error ? <p className="mb-2 text-sm text-danger">Erro: {open.error}</p> : null}
          <ol className="space-y-1 font-mono text-xs text-fg">
            {open.log.map((l, i) => (
              <li key={i} className={l.level === 'erro' ? 'text-danger' : undefined}>
                <span className="text-fg-muted">{format(new Date(l.at), 'HH:mm:ss')}</span> {l.message}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
