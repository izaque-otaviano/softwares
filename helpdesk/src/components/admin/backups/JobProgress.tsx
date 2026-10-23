import { Spinner } from '@/components/ui';
import type { BackupJob } from '@/types/admin-a';

/** Estado de um backup/restauração em andamento: etapa, barra de progresso e últimas linhas do log. */
export function JobProgress({ job }: { job: BackupJob }) {
  const label = job.kind === 'restauracao' ? 'Restauração em andamento' : 'Backup em andamento';
  const pct = job.progress;
  return (
    <section aria-label={label} className="rounded border border-line bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Spinner label="" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{job.step || 'Aguardando na fila'}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct === null ? { 'aria-valuetext': job.step || 'Em andamento' } : { 'aria-valuenow': pct })}
        className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-2"
      >
        <div className="h-full rounded-pill bg-action transition-[width] duration-150" style={{ width: `${pct ?? 15}%` }} />
      </div>
      {pct !== null ? <p className="mt-1 text-xs text-fg-muted">{pct}%</p> : null}
    </section>
  );
}
