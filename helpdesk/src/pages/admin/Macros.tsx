import { errMessage } from '@/lib/apiError';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { macrosApi } from '@/api';
import { PageHeader } from '@/components/admin/PageHeader';
import { DropdownButton } from '@/components/admin/lists/DropdownButton';
import { ListToolbar, matchesActive, type ActiveFilter } from '@/components/admin/lists/ListToolbar';
import { useAsync } from '@/components/admin/lists/useAsync';
import { AVAILABLE_TO_LABEL } from '@/components/admin/macros/macroText';
import { Banner, Button, ConfirmModal, Pill, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { MACRO_WRITE, useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { Macro } from '@/types/domain';

const norm = (s: string) => s.toLocaleLowerCase('pt-BR');
const date = (iso?: string) => (iso ? format(new Date(iso), 'dd/MM/yyyy', { locale: ptBR }) : '—');

export default function Macros() {
  const navigate = useNavigate();
  const canWrite = useCan(MACRO_WRITE);
  const { data, loading, error, reload, setData } = useAsync(() => macrosApi.listMacros().then((l) => [...l]));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Macro[] | null>(null);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return (data ?? []).filter((m) => matchesActive(m.active, filter)).filter((m) => !q || norm(`${m.name} ${m.description ?? ''}`).includes(q));
  }, [data, query, filter]);

  const setActive = async (list: Macro[], active: boolean) => {
    try {
      const saved = await Promise.all(list.map((m) => macrosApi.saveMacro({ ...m, active })));
      setData((prev) => (prev ?? []).map((m) => saved.find((s) => s.id === m.id) ?? m));
      setSelected(new Set());
      toast.success(active ? 'Macros ativadas' : 'Macros desativadas');
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível alterar as macros. Tente novamente.'));
    }
  };

  const selectedMacros = (data ?? []).filter((m) => selected.has(m.id));
  const none = selectedMacros.length === 0;

  const columns: ColumnDef<Macro>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      width: 320,
      cell: (m) => (
        <span className="flex items-center gap-2">
          <Link to={`/admin/macros/${m.id}`} className="truncate rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {m.name}
          </Link>
          {m.active ? null : <Pill>Inativa</Pill>}
        </span>
      ),
    },
    { id: 'createdAt', header: 'Data da criação', label: 'Data da criação', width: 160, cell: (m) => date(m.createdAt) },
    { id: 'updatedAt', header: 'Data da última atualização', label: 'Data da última atualização', width: 220, cell: (m) => date(m.updatedAt) },
    { id: 'availableTo', header: 'Disponível para', label: 'Disponível para', width: 180, cell: (m) => AVAILABLE_TO_LABEL[m.availableTo] },
    { id: 'usage7d', header: 'Uso 7 dias', label: 'Uso 7 dias', width: 120, align: 'right', cell: (m) => m.usage7d.toLocaleString('pt-BR') },
  ];

  // Sem `macro.manage` o agente só consulta: nada de criar, editar, ativar ou excluir.
  const rowActions = (m: Macro): MenuItemSpec[] =>
    !canWrite
      ? [{ id: 'view', label: 'Ver macro', onSelect: () => navigate(`/admin/macros/${m.id}`) }]
      : [
          { id: 'edit', label: 'Editar', onSelect: () => navigate(`/admin/macros/${m.id}`) },
          { id: 'toggle', label: m.active ? 'Desativar' : 'Ativar', onSelect: () => void setActive([m], !m.active) },
          { id: 'delete', label: 'Excluir', tone: 'danger' as const, onSelect: () => setToDelete([m]) },
        ];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Espaços de trabalho' }, { label: 'Macros' }]}
        title="Macros"
        description="Macros são conjuntos de ações e respostas que os agentes aplicam a um ticket com um clique."
        learnMoreHref="https://example.com/ajuda/macros"
        actions={
          canWrite ? (
            <Button variant="ink" onClick={() => navigate('/admin/macros/new')}>
              Criar macro
            </Button>
          ) : undefined
        }
      />
      {canWrite ? null : (
        <div className="px-6 pt-2">
          <Banner tone="info">Você pode aplicar macros nos tickets, mas só quem tem a permissão de gerenciar macros (administradores) cria, edita ou exclui.</Banner>
        </div>
      )}
      <div className="mt-2">
        <ListToolbar searchLabel="Pesquisar macros" query={query} onQuery={setQuery} filterLabel="Filtrar por status" filter={filter} onFilter={setFilter}>
          {canWrite ? (
            <DropdownButton
              label="Ações"
              items={[
                { id: 'activate', label: 'Ativar selecionadas', disabled: none, onSelect: () => void setActive(selectedMacros, true) },
                { id: 'deactivate', label: 'Desativar selecionadas', disabled: none, onSelect: () => void setActive(selectedMacros, false) },
                { id: 'delete', label: 'Excluir selecionadas', tone: 'danger', disabled: none, onSelect: () => setToDelete(selectedMacros) },
              ]}
            />
          ) : null}
        </ListToolbar>
      </div>
      <div className="px-6 pb-6">
        <Table<Macro>
          id="admin-macros"
          aria-label="Macros"
          columns={columns}
          rows={rows}
          getRowId={(m) => m.id}
          getRowLabel={(m) => m.name}
          selectable={canWrite}
          selectedIds={selected}
          onSelectionChange={setSelected}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{
            title: 'Nenhuma macro encontrada',
            description: canWrite ? 'Ajuste a busca ou o filtro, ou crie uma macro.' : 'Ajuste a busca ou o filtro.',
            action: canWrite ? (
              <Button variant="ink" onClick={() => navigate('/admin/macros/new')}>
                Criar macro
              </Button>
            ) : undefined,
          }}
        />
      </div>
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete && toDelete.length > 1 ? 'Excluir macros' : 'Excluir macro'}
        description={toDelete ? (toDelete.length === 1 ? `Excluir "${toDelete[0]!.name}"? Esta ação não pode ser desfeita.` : `Excluir ${toDelete.length} macros? Esta ação não pode ser desfeita.`) : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await Promise.all(toDelete.map((m) => macrosApi.deleteMacro(m.id)));
            const ids = new Set(toDelete.map((m) => m.id));
            setData((prev) => (prev ?? []).filter((m) => !ids.has(m.id)));
            setSelected(new Set());
            toast.success('Macros excluídas');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível excluir. Tente novamente.'));
            throw e;
          }
        }}
      />
    </div>
  );
}
