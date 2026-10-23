import { useState } from 'react';
import { getRetentionRun, reviewRetentionRun } from '@/api/retention';
import { useAsync } from '@/components/admin/useAsync';
import { DetailList } from '../audit/DetailList';
import { dateTime } from '../audit/format';
import { StrongConfirmModal } from '../audit/StrongConfirmModal';
import { Banner, Button, Drawer, Field, Skeleton, Textarea } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { RetentionRun } from '@/types/admin-b';
import { PolicyTable } from './PolicyTable';

export const RUN_STATUS: Record<RetentionRun['status'], string> = { running: 'Em execução', done: 'Concluído', failed: 'Falhou' };

export function RunDrawer({ run, canReview, onClose, onChanged }: { run: RetentionRun | null; canReview: boolean; onClose: () => void; onChanged: (r: RetentionRun) => void }) {
  return (
    <Drawer open={run !== null} onOpenChange={(o) => !o && onClose()} title={run ? `${run.dryRun ? 'Simulação' : 'Expurgo'} #${run.id}` : 'Ciclo'} description="Resultado por tipo de dado" width="w-full max-w-xl">
      {run ? <RunBody key={run.id} initial={run} canReview={canReview} onChanged={onChanged} /> : null}
    </Drawer>
  );
}

function RunBody({ initial, canReview, onChanged }: { initial: RetentionRun; canReview: boolean; onChanged: (r: RetentionRun) => void }) {
  const detail = useAsync(() => getRetentionRun(initial.id));
  const [local, setLocal] = useState<RetentionRun | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState('');
  const run = local ?? detail.data ?? initial;
  const needsReview = run.dryRun && !run.isReviewed;

  return (
    <div className="space-y-5">
      {run.dryRun ? <Banner tone="info">Esta é uma simulação: nada foi apagado. Os números mostram o que seria apagado hoje.</Banner> : null}
      <DetailList
        items={[
          { label: 'Estado', value: RUN_STATUS[run.status] },
          { label: 'Iniciado', value: dateTime(run.createdAt) },
          { label: 'Concluído', value: dateTime(run.finishedAt) },
          { label: 'Por', value: run.triggeredByName },
          { label: 'Revisão', value: run.isReviewed ? `${run.reviewedByName ?? 'Alguém'}, ${dateTime(run.reviewedAt)}` : run.dryRun ? 'Ainda não revisada' : 'Não se aplica' },
          { label: 'Nota da revisão', value: run.reviewNote },
        ]}
      />
      {detail.loading && !detail.data ? <Skeleton height={80} /> : <PolicyTable policies={run.policies} dryRun={run.dryRun} id={run.id} />}
      {detail.error ? <p className="text-sm text-danger">{detail.error}</p> : null}
      {needsReview ? (
        canReview ? (
          <div className="rounded border border-line p-3">
            <h3 className="text-sm font-semibold text-fg">Revisão</h3>
            <p className="mt-1 text-sm text-fg-muted">Registrar a revisão diz, com seu nome e data, que você conferiu este relatório e que o expurgo efetivo pode ser liberado no servidor. A tela não executa o expurgo.</p>
            <Button className="mt-3" variant="outline" onClick={() => setReviewing(true)}>
              Registrar revisão
            </Button>
          </div>
        ) : (
          <Banner tone="info">Só administradores registram a revisão de uma simulação.</Banner>
        )
      ) : null}
      <StrongConfirmModal
        open={reviewing}
        onOpenChange={setReviewing}
        title="Registrar revisão da simulação"
        identifier={`REVISAR-${run.id}`}
        confirmLabel="Registrar revisão"
        consequences="Ao revisar, você libera o expurgo efetivo agendado no servidor: depois disso, dados vencidos poderão ser apagados e isso não tem volta. Só confirme se conferiu cada tipo de dado da lista."
        onConfirm={async () => {
          const saved = await reviewRetentionRun(run.id, note);
          setLocal(saved);
          onChanged(saved);
          toast.success('Revisão registrada');
        }}
      >
        <Field label="Nota da revisão (opcional)" hint="Até 250 caracteres.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 250))} rows={2} />
        </Field>
      </StrongConfirmModal>
    </div>
  );
}
