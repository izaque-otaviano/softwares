import { useMemo, useState } from 'react';
import * as api from '@/api/plans';
import { PageHeader } from '@/components/admin/PageHeader';
import { ListToolbar, matchesActive, type ActiveFilter } from '@/components/admin/lists/ListToolbar';
import { useAsync } from '@/components/admin/lists/useAsync';
import { PERIOD_LABEL, PlanDrawer } from '@/components/admin/plans/PlanDrawer';
import { formatMinutes, ReadOnlyNotice } from '@/components/admin/sla/adminAForm';
import { Button, ConfirmModal, Pill, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { Plan, PlanInput } from '@/types/admin-a';

const norm = (s: string) => s.toLocaleLowerCase('pt-BR');

export default function AdminPlans() {
  const canWrite = useCan(SETTINGS_WRITE);
  const { data, loading, error, reload, setData } = useAsync(() => api.listPlans());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('all');
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Plan | null>(null);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return (data ?? []).filter((p) => matchesActive(p.active, filter)).filter((p) => !q || norm(`${p.name} ${p.description}`).includes(q));
  }, [data, query, filter]);

  const upsert = (saved: Plan) =>
    setData((prev) => {
      const list = prev ?? [];
      const next = list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved];
      return next.sort((a, b) => b.rank - a.rank);
    });

  const save = async (input: PlanInput) => {
    upsert(await api.savePlan(input));
    toast.success(input.id ? 'Plano atualizado' : 'Plano criado');
  };

  const reactivate = async (p: Plan) => {
    try {
      upsert(await api.savePlan({ ...p, active: true }));
      toast.success('Plano ativado');
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível ativar o plano. Tente novamente.'));
    }
  };

  const columns: ColumnDef<Plan>[] = [
    {
      id: 'name',
      header: 'Plano',
      label: 'Plano',
      width: 240,
      cell: (p) => (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(p)} className="truncate rounded-xs text-left text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {p.name}
          </button>
          {p.active ? null : <Pill>Inativo</Pill>}
        </span>
      ),
    },
    { id: 'rank', header: 'Posição', label: 'Posição', width: 100, align: 'right', cell: (p) => p.rank },
    { id: 'tickets', header: 'Franquia de tickets', label: 'Franquia de tickets', width: 170, cell: (p) => (p.ticketLimit === null ? 'Ilimitada' : `${p.ticketLimit} por ${PERIOD_LABEL[p.limitPeriod] ?? p.limitPeriod}`) },
    { id: 'hours', header: 'Horas de manutenção', label: 'Horas de manutenção', width: 190, cell: (p) => (p.monthlyMaintenanceMinutes === null ? 'Sem franquia' : `${formatMinutes(p.monthlyMaintenanceMinutes)} por mês`) },
    { id: 'chat', header: 'Chat', label: 'Chat', width: 120, cell: (p) => (p.chatEnabled ? (p.chatConsumesQuota ? 'Consome franquia' : 'Habilitado') : 'Desligado') },
    { id: 'companies', header: 'Empresas', label: 'Empresas', width: 110, align: 'right', cell: (p) => p.companyCount },
  ];

  const rowActions = (p: Plan): MenuItemSpec[] =>
    canWrite
      ? [
          { id: 'edit', label: 'Editar', onSelect: () => setEditing(p) },
          p.active ? { id: 'deactivate', label: 'Desativar', tone: 'danger' as const, onSelect: () => setToDeactivate(p) } : { id: 'activate', label: 'Ativar', onSelect: () => void reactivate(p) },
        ]
      : [{ id: 'view', label: 'Ver plano', onSelect: () => setEditing(p) }];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Planos' }]}
        title="Planos"
        description="Planos de atendimento: franquia de tickets, horas de manutenção contratadas e chat. As empresas clientes escolhem um plano."
        actions={
          canWrite ? (
            <Button variant="ink" onClick={() => setEditing('new')}>
              Novo plano
            </Button>
          ) : undefined
        }
      />
      {canWrite ? null : <ReadOnlyNotice>Você pode consultar os planos, mas só administradores criam, editam ou desativam.</ReadOnlyNotice>}
      <div className="mt-2">
        <ListToolbar searchLabel="Pesquisar planos" query={query} onQuery={setQuery} filterLabel="Filtrar por status" filter={filter} onFilter={setFilter} />
      </div>
      <div className="px-6 pb-6">
        <Table<Plan>
          id="admin-plans"
          aria-label="Planos"
          columns={columns}
          rows={rows}
          getRowId={(p) => p.id}
          getRowLabel={(p) => p.name}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{ title: 'Nenhum plano encontrado', description: 'Ajuste a busca ou o filtro.' }}
        />
      </div>
      <PlanDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} plan={editing === 'new' ? null : editing} readOnly={!canWrite} onSave={save} />
      <ConfirmModal
        open={toDeactivate !== null}
        onOpenChange={(o) => !o && setToDeactivate(null)}
        title="Desativar plano"
        description={toDeactivate ? `Desativar "${toDeactivate.name}"? Planos em uso não são apagados: ele deixa de ser oferecido, e as ${toDeactivate.companyCount} empresas atuais continuam nele. Você pode ativá-lo de novo.` : undefined}
        confirmLabel="Desativar"
        tone="danger"
        onConfirm={async () => {
          if (!toDeactivate) return;
          const id = toDeactivate.id;
          try {
            await api.deletePlan(id);
            setData((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, active: false } : p)));
            toast.success('Plano desativado');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível desativar. Tente novamente.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
