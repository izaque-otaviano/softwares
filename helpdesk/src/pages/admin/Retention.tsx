import { useMemo, useState } from 'react';
import { listRetentionRuns, simulateRetention } from '@/api/retention';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { AUDIT_ACCESS, NO_PERMISSION_MESSAGE } from '@/components/admin/audit/adminAccess';
import { count, dateTime } from '@/components/admin/audit/format';
import { Pager } from '@/components/admin/audit/Pager';
import { usePaged } from '@/components/admin/audit/usePaged';
import { PolicyTable } from '@/components/admin/retention/PolicyTable';
import { POLICY_LABEL } from '@/components/admin/retention/policyText';
import { RUN_STATUS, RunDrawer } from '@/components/admin/retention/RunDrawer';
import { Banner, Button, ConfirmModal, Pill, Table, type ColumnDef } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { RetentionRun } from '@/types/admin-b';

const PAGE = 10;

/** Retenção de dados: simulação (sem apagar nada), resultado por tipo de dado e revisão. O expurgo efetivo só roda no servidor. */
export default function AdminRetention() {
  const canRead = useCan(AUDIT_ACCESS);
  const { page, loading, error, offset, setOffset, reload } = usePaged((o) => listRetentionRuns({ limit: PAGE, offset: o }), 'runs', canRead);
  const [simulating, setSimulating] = useState(false);
  const [open, setOpen] = useState<RetentionRun | null>(null);
  const [patched, setPatched] = useState<Record<string, RetentionRun>>({});

  const items = useMemo(() => (page?.items ?? []).map((r) => patched[r.id] ?? r), [page, patched]);
  // O último ciclo da PRIMEIRA página mostra o resultado atual por tipo de dado.
  const latest = offset === 0 ? items[0] : undefined;

  const columns: ColumnDef<RetentionRun>[] = [
    { id: 'id', header: 'Ciclo', label: 'Ciclo', width: 80, cell: (r) => `#${r.id}` },
    { id: 'kind', header: 'Tipo', label: 'Tipo', width: 110, cell: (r) => (r.dryRun ? 'Simulação' : <Pill tone="danger">Expurgo</Pill>) },
    { id: 'status', header: 'Estado', label: 'Estado', width: 120, cell: (r) => RUN_STATUS[r.status] },
    { id: 'when', header: 'Quando', label: 'Quando', width: 150, cell: (r) => dateTime(r.createdAt) },
    { id: 'by', header: 'Por', label: 'Por', width: 140, cell: (r) => r.triggeredByName },
    { id: 'matched', header: 'Elegíveis', label: 'Elegíveis', width: 110, align: 'right', cell: (r) => count(r.totalMatched) },
    { id: 'applied', header: 'Apagados', label: 'Apagados', width: 110, align: 'right', cell: (r) => count(r.totalApplied) },
    { id: 'review', header: 'Revisão', label: 'Revisão', width: 190, cell: (r) => (!r.dryRun ? '—' : r.isReviewed ? `Revisada por ${r.reviewedByName ?? 'alguém'}` : 'Aguardando revisão') },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Retenção de dados' }]}
        title="Retenção de dados"
        description="Dados antigos saem do sistema por política. Antes de qualquer expurgo, o servidor exige uma simulação revisada por uma pessoa."
        actions={
          canRead ? (
            <Button variant="ink" onClick={() => setSimulating(true)}>
              Simular agora
            </Button>
          ) : undefined
        }
      />
      <AdminBody className="space-y-6">
        {!canRead ? (
          <Banner tone="info">{NO_PERMISSION_MESSAGE} A retenção de dados é exclusiva de administradores.</Banner>
        ) : (
          <>
            <Banner tone="info">
              Esta tela só simula e registra revisões: ela não apaga nada. O expurgo efetivo roda no servidor, em horário agendado, e só depois de uma simulação revisada. Os prazos de cada tipo de dado são definidos no servidor e a API ainda não os informa.
            </Banner>
            <section aria-labelledby="ret-policies">
              <h2 id="ret-policies" className="mb-1 text-md font-semibold text-fg">
                Tipos de dado
              </h2>
              {latest ? (
                <>
                  <p className="mb-2 text-sm text-fg-muted">
                    Resultado do ciclo #{latest.id} ({latest.dryRun ? 'simulação' : 'expurgo'}, {dateTime(latest.createdAt)}).
                  </p>
                  <PolicyTable policies={latest.policies} dryRun={latest.dryRun} id={latest.id} />
                </>
              ) : loading && !page ? (
                <p className="text-sm text-fg-muted">Carregando...</p>
              ) : (
                <p className="text-sm text-fg-muted">
                  Nenhuma simulação ainda. Use "Simular agora" para ver quanto de cada tipo de dado ({Object.values(POLICY_LABEL).map((p) => p.name.toLowerCase()).join(', ')}) estaria fora do prazo.
                </p>
              )}
            </section>
            <section aria-labelledby="ret-runs">
              <h2 id="ret-runs" className="mb-2 text-md font-semibold text-fg">
                Ciclos
              </h2>
              <Table<RetentionRun>
                id="admin-retention-runs"
                aria-label="Ciclos de retenção"
                columns={columns}
                rows={items}
                getRowId={(r) => r.id}
                getRowLabel={(r) => `${r.dryRun ? 'Simulação' : 'Expurgo'} ${r.id}`}
                loading={loading && !page}
                error={error && !page ? { message: error, onRetry: reload } : undefined}
                onRowClick={setOpen}
                empty={{ title: 'Nenhum ciclo ainda', description: 'Rode uma simulação para ver o que seria apagado.' }}
              />
              {page ? <Pager total={page.total} limit={page.limit} offset={offset} onOffset={setOffset} loading={loading} label="Paginação dos ciclos" /> : null}
            </section>
          </>
        )}
      </AdminBody>
      <ConfirmModal
        open={simulating}
        onOpenChange={setSimulating}
        tone="primary"
        title="Simular retenção agora"
        description="A simulação conta e amostra o que estaria fora do prazo e grava um relatório. Nada é apagado nem alterado nos dados."
        confirmLabel="Simular"
        onConfirm={async () => {
          try {
            const run = await simulateRetention();
            toast.success(`Simulação #${run.id} concluída`);
            setOffset(0);
            reload();
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível simular. Tente novamente.'));
            throw e;
          }
        }}
      />
      <RunDrawer
        run={open ? (patched[open.id] ?? open) : null}
        canReview={canRead}
        onClose={() => setOpen(null)}
        onChanged={(r) => setPatched((p) => ({ ...p, [r.id]: r }))}
      />
    </>
  );
}
