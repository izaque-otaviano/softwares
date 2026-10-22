import { ListOrdered } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { triggersApi } from '@/api';
import { PageHeader } from '@/components/admin/PageHeader';
import { DropdownButton } from '@/components/admin/lists/DropdownButton';
import { ListToolbar, matchesActive, type ActiveFilter } from '@/components/admin/lists/ListToolbar';
import { useAsync } from '@/components/admin/lists/useAsync';
import { OrderEditor } from '@/components/admin/triggers/OrderEditor';
import { Button, ConfirmModal, Pill, Table, Tabs, TabsContent, TabsList, TabsTrigger, EmptyState, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { toast } from '@/store/useUi';
import type { Trigger } from '@/types/domain';

const norm = (s: string) => s.toLocaleLowerCase('pt-BR');

export default function Triggers() {
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useAsync(() => triggersApi.listTriggers().then((l) => [...l]));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const [ordering, setOrdering] = useState<Trigger[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [toDelete, setToDelete] = useState<Trigger | null>(null);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    const list = (data ?? []).filter((t) => matchesActive(t.active, filter)).filter((t) => !q || norm(`${t.name} ${t.description} ${t.category}`).includes(q));
    // agrupa por categoria na ordem em que aparecem, mantendo a ordem de avaliação dentro de cada uma
    const cats = [...new Set(list.map((t) => t.category))];
    return cats.flatMap((c) => list.filter((t) => t.category === c));
  }, [data, query, filter]);

  const toggle = async (t: Trigger) => {
    try {
      const next = await triggersApi.setTriggerActive(t.id, !t.active);
      setData((prev) => (prev ?? []).map((x) => (x.id === t.id ? next : x)));
      toast.success(next.active ? `Gatilho "${t.name}" ativado` : `Gatilho "${t.name}" desativado`);
    } catch {
      toast.error('Não foi possível alterar o gatilho. Tente novamente.');
    }
  };

  const saveOrder = async () => {
    if (!ordering) return;
    setSavingOrder(true);
    try {
      const saved = await triggersApi.reorderTriggers(ordering.map((t) => t.id));
      setData([...saved]);
      setOrdering(null);
      toast.success('Ordem dos gatilhos salva');
    } catch {
      toast.error('Não foi possível salvar a ordem. Tente novamente.');
    } finally {
      setSavingOrder(false);
    }
  };

  const columns: ColumnDef<Trigger>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      width: 340,
      cell: (t) => (
        <span className="flex items-center gap-2">
          <Link to={`/admin/triggers/${t.id}`} className="truncate rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {t.name}
          </Link>
          {t.active ? null : <Pill>Inativo</Pill>}
        </span>
      ),
    },
    { id: 'description', header: 'Descrição', label: 'Descrição', width: 420, cell: (t) => <span className="text-fg-muted">{t.description || '—'}</span> },
    { id: 'fired7d', header: 'Iniciado por gatilho (7d)', label: 'Iniciado por gatilho (7d)', width: 200, align: 'right', cell: (t) => t.fired7d.toLocaleString('pt-BR') },
  ];

  const rowActions = (t: Trigger): MenuItemSpec[] => [
    { id: 'edit', label: 'Editar', onSelect: () => navigate(`/admin/triggers/${t.id}`) },
    { id: 'toggle', label: t.active ? 'Desativar' : 'Ativar', onSelect: () => void toggle(t) },
    { id: 'delete', label: 'Excluir', tone: 'danger', onSelect: () => setToDelete(t) },
  ];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Objetos e regras' }, { label: 'Gatilhos' }]}
        title="Gatilhos"
        description="Gatilhos são regras que rodam quando um ticket é criado ou atualizado. Eles são avaliados na ordem da lista."
        learnMoreHref="https://example.com/ajuda/gatilhos"
        actions={
          <DropdownButton
            variant="ink"
            label="Criar gatilho"
            items={[
              { id: 'blank', label: 'Gatilho em branco', onSelect: () => navigate('/admin/triggers/new') },
              { id: 'notify', label: 'Notificar solicitante (modelo)', onSelect: () => navigate('/admin/triggers/new?modelo=notificar') },
            ]}
          />
        }
      />
      <Tabs defaultValue="ticket" className="mt-4 flex-1">
        <TabsList aria-label="Tipo de gatilho" className="px-6">
          <TabsTrigger value="ticket">Ticket</TabsTrigger>
          <TabsTrigger value="object">Objeto</TabsTrigger>
        </TabsList>
        <TabsContent value="ticket" className="outline-none">
          {ordering ? (
            <div className="px-6 py-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="mr-auto text-sm text-fg-muted">Reordene com as setas ou com Alt + ↑/↓. Os gatilhos rodam de cima para baixo.</p>
                <Button variant="outline" onClick={() => setOrdering(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" loading={savingOrder} onClick={() => void saveOrder()}>
                  Salvar ordem
                </Button>
              </div>
              <OrderEditor items={ordering} onChange={setOrdering} />
            </div>
          ) : (
            <>
              <ListToolbar searchLabel="Pesquisar gatilhos" query={query} onQuery={setQuery} filterLabel="Filtrar por status" filter={filter} onFilter={setFilter}>
                <Button variant="outline" leadingIcon={<ListOrdered />} disabled={!data || data.length < 2} onClick={() => setOrdering([...(data ?? [])])}>
                  Editar ordem
                </Button>
              </ListToolbar>
              <div className="px-6 pb-6">
                <Table<Trigger>
                  id="admin-triggers"
                  aria-label="Gatilhos de ticket"
                  columns={columns}
                  rows={rows}
                  getRowId={(t) => t.id}
                  getRowLabel={(t) => t.name}
                  loading={loading}
                  error={error ? { message: error, onRetry: reload } : undefined}
                  groupBy={(t) => ({ key: t.category, label: t.category })}
                  rowActions={rowActions}
                  empty={{ illustration: 'search', title: 'Nenhum gatilho encontrado', description: 'Ajuste a busca ou o filtro, ou crie um novo gatilho.' }}
                />
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="object" className="outline-none">
          <EmptyState illustration="box" title="Nenhum gatilho de objeto" description="Gatilhos de objeto reagem a mudanças em objetos personalizados. Ainda não há nenhum." />
        </TabsContent>
      </Tabs>
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir gatilho"
        description={toDelete ? `Excluir "${toDelete.name}"? Esta ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await triggersApi.deleteTrigger(toDelete.id);
            setData((prev) => (prev ?? []).filter((x) => x.id !== toDelete.id));
            toast.success('Gatilho excluído');
          } catch (e) {
            toast.error('Não foi possível excluir o gatilho.');
            throw e;
          }
        }}
      />
    </div>
  );
}
