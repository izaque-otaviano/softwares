import { useMemo, useState } from 'react';
import * as api from '@/api/sla';
import { PageHeader } from '@/components/admin/PageHeader';
import { ListToolbar, matchesActive, type ActiveFilter } from '@/components/admin/lists/ListToolbar';
import { useAsync } from '@/components/admin/lists/useAsync';
import { formatMinutes, ReadOnlyNotice } from '@/components/admin/sla/adminAForm';
import { SlaPolicyDrawer } from '@/components/admin/sla/SlaPolicyDrawer';
import { Button, ConfirmModal, Pill, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { SlaPolicy, SlaPolicyInput } from '@/types/admin-a';

const norm = (s: string) => s.toLocaleLowerCase('pt-BR');

export default function AdminSla() {
  const canWrite = useCan(SETTINGS_WRITE);
  const { data, loading, error, reload, setData } = useAsync(() => api.listSlaPolicies());
  const refs = useAsync(() => api.getSlaRefs());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('all');
  const [editing, setEditing] = useState<SlaPolicy | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SlaPolicy | null>(null);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return (data ?? []).filter((p) => matchesActive(p.active, filter)).filter((p) => !q || norm(`${p.name} ${p.planName ?? ''} ${p.teamName ?? ''}`).includes(q));
  }, [data, query, filter]);

  const upsert = (saved: SlaPolicy) =>
    setData((prev) => {
      const list = prev ?? [];
      return list.some((p) => p.id === saved.id) ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved];
    });

  const save = async (input: SlaPolicyInput) => {
    // Se falhar, o erro sobe: o drawer segue aberto com o que foi digitado e mostra o motivo (403 inclusive).
    const saved = await api.saveSlaPolicy(input);
    upsert(saved);
    toast.success(input.id ? 'Política atualizada' : 'Política criada');
  };

  const toggle = async (p: SlaPolicy) => {
    try {
      upsert(await api.saveSlaPolicy({ ...p, active: !p.active }));
      toast.success(p.active ? 'Política desativada' : 'Política ativada');
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível alterar a política. Tente novamente.'));
    }
  };

  const columns: ColumnDef<SlaPolicy>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      width: 280,
      cell: (p) => (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(p)} className="truncate rounded-xs text-left text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {p.name}
          </button>
          {p.active ? null : <Pill>Inativa</Pill>}
        </span>
      ),
    },
    { id: 'scope', header: 'Aplica-se a', label: 'Aplica-se a', width: 220, cell: (p) => `${p.planName ?? 'Todos os planos'} · ${p.teamName ?? 'todas as equipes'}` },
    { id: 'first', header: 'Primeira resposta', label: 'Primeira resposta', width: 150, align: 'right', cell: (p) => formatMinutes(p.firstResponseMinutes) },
    { id: 'resolution', header: 'Solução', label: 'Solução', width: 120, align: 'right', cell: (p) => formatMinutes(p.resolutionMinutes) },
    { id: 'hours', header: 'Contagem', label: 'Contagem', width: 200, cell: (p) => (p.useBusinessHours ? 'Horário de atendimento' : '24 horas') },
  ];

  const rowActions = (p: SlaPolicy): MenuItemSpec[] =>
    canWrite
      ? [
          { id: 'edit', label: 'Editar', onSelect: () => setEditing(p) },
          { id: 'toggle', label: p.active ? 'Desativar' : 'Ativar', onSelect: () => void toggle(p) },
          { id: 'delete', label: 'Excluir', tone: 'danger' as const, onSelect: () => setToDelete(p) },
        ]
      : [{ id: 'view', label: 'Ver política', onSelect: () => setEditing(p) }];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'SLA e prazos' }]}
        title="SLA e prazos"
        description="Políticas de prazo de primeira resposta e de solução, por plano e equipe. A política mais específica vence."
        actions={
          canWrite ? (
            <Button variant="ink" onClick={() => setEditing('new')}>
              Nova política
            </Button>
          ) : undefined
        }
      />
      {canWrite ? null : <ReadOnlyNotice>Você pode consultar as políticas de SLA, mas só administradores criam, editam ou excluem.</ReadOnlyNotice>}
      <div className="mt-2">
        <ListToolbar searchLabel="Pesquisar políticas" query={query} onQuery={setQuery} filterLabel="Filtrar por status" filter={filter} onFilter={setFilter} />
      </div>
      <div className="px-6 pb-6">
        <Table<SlaPolicy>
          id="admin-sla"
          aria-label="Políticas de SLA"
          columns={columns}
          rows={rows}
          getRowId={(p) => p.id}
          getRowLabel={(p) => p.name}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{
            title: 'Nenhuma política encontrada',
            description: canWrite ? 'Ajuste a busca ou o filtro, ou crie uma política.' : 'Ajuste a busca ou o filtro.',
            action: canWrite ? (
              <Button variant="ink" onClick={() => setEditing('new')}>
                Nova política
              </Button>
            ) : undefined,
          }}
        />
      </div>
      <SlaPolicyDrawer
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        policy={editing === 'new' ? null : editing}
        plans={refs.data?.plans ?? []}
        teams={refs.data?.teams ?? []}
        defaultCalendar={refs.data?.defaultCalendar ?? null}
        readOnly={!canWrite}
        onSave={save}
      />
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir política de SLA"
        description={toDelete ? `Excluir "${toDelete.name}"? Os tickets que usavam esta política passam a seguir a próxima mais específica. Esta ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await api.deleteSlaPolicy(toDelete.id);
            const id = toDelete.id;
            setData((prev) => (prev ?? []).filter((p) => p.id !== id));
            toast.success('Política excluída');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível excluir. Tente novamente.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
