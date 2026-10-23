import { errMessage } from '@/lib/apiError';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/PageHeader';
import { ListToolbar, matchesActive, type ActiveFilter } from '@/components/admin/lists/ListToolbar';
import { StatusModal } from '@/components/admin/status/StatusModal';
import { CATEGORY_DESCRIPTION, FACTORY_NOTE, isActive, isFactory } from '@/components/admin/status/statusRules';
import { Button, Pill, StatusBadge, StatusDot, Table, Tabs, TabsContent, TabsList, TabsTrigger, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/status';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import type { TicketStatus } from '@/types/domain';

const norm = (s: string) => s.toLocaleLowerCase('pt-BR');

export default function Statuses() {
  // Fonte única: a mesma store que BottomBar, StatusBadge, Home e Views leem.
  const statuses = useTickets((s) => s.statuses);
  const [ready, setReady] = useState(statuses.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('active');
  const [modal, setModal] = useState<{ open: boolean; status: TicketStatus | null }>({ open: false, status: null });

  const load = () => {
    setError(null);
    useTickets
      .getState()
      .loadStatuses()
      .then(() => setReady(true))
      .catch(() => setError('Não foi possível carregar os status do ticket.'));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    const q = norm(query.trim());
    return statuses
      .filter((s) => matchesActive(isActive(s), filter))
      .filter((s) => !q || norm(`${s.agentName} ${s.agentDescription} ${s.endUserName}`).includes(q))
      .map((s, i) => ({ s, i }))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.s.category) - CATEGORY_ORDER.indexOf(b.s.category) || a.i - b.i)
      .map((x) => x.s);
  }, [statuses, query, filter]);

  const toggleActive = async (s: TicketStatus) => {
    try {
      await useTickets.getState().saveStatus({ ...s, active: !isActive(s) });
      toast.success(isActive(s) ? `Status "${s.agentName}" desativado` : `Status "${s.agentName}" ativado`);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível alterar o status. Tente novamente.'));
    }
  };

  const columns: ColumnDef<TicketStatus>[] = [
    {
      id: 'agentName',
      header: 'Nome (agente)',
      label: 'Nome (agente)',
      width: 260,
      cell: (s) => (
        <span className="flex items-center gap-2">
          <StatusDot color={s.color} />
          <span className="truncate">{s.agentName}</span>
          {isFactory(s) ? <Pill title={FACTORY_NOTE}>De fábrica</Pill> : null}
          {isActive(s) ? null : <Pill>Inativo</Pill>}
        </span>
      ),
    },
    { id: 'agentDescription', header: 'Descrição (agente)', label: 'Descrição (agente)', width: 380, cell: (s) => <span className="text-fg-muted">{s.agentDescription || '—'}</span> },
    { id: 'endUserName', header: 'Nome (usuário final)', label: 'Nome (usuário final)', width: 220, cell: (s) => s.endUserName },
  ];

  const rowActions = (s: TicketStatus): MenuItemSpec[] => [
    { id: 'edit', label: 'Editar', onSelect: () => setModal({ open: true, status: s }) },
    isActive(s)
      ? { id: 'deactivate', label: isFactory(s) ? 'Desativar (status de fábrica)' : 'Desativar', disabled: isFactory(s), onSelect: () => void toggleActive(s) }
      : { id: 'activate', label: 'Ativar', onSelect: () => void toggleActive(s) },
  ];

  const loading = !ready && !error;
  const tableError = error ? { message: error, onRetry: load } : undefined;

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <PageHeader
        breadcrumb={[{ label: 'Objetos e regras' }, { label: 'Status do ticket' }]}
        title="Status do ticket"
        description="Crie status personalizados dentro de cada categoria. Eles ficam disponíveis para os agentes assim que forem salvos."
        learnMoreHref="https://example.com/ajuda/status-do-ticket"
        actions={
          <Button variant="ink" leadingIcon={<Plus />} onClick={() => setModal({ open: true, status: null })}>
            Criar status do ticket
          </Button>
        }
      />
      <Tabs defaultValue="status" className="mt-4 flex-1">
        <TabsList aria-label="Status do ticket" className="px-6">
          <TabsTrigger value="status">Status do ticket</TabsTrigger>
          <TabsTrigger value="forms">Status do ticket por formulário</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="outline-none">
          <ListToolbar searchLabel="Pesquisar status do ticket" query={query} onQuery={setQuery} filterLabel="Filtrar por situação" filter={filter} onFilter={setFilter} />
          <div className="px-6 pb-6">
            <Table<TicketStatus>
              id="admin-statuses"
              aria-label="Status do ticket"
              columns={columns}
              rows={rows}
              getRowId={(s) => s.id}
              getRowLabel={(s) => s.agentName}
              loading={loading}
              error={tableError}
              groupBy={(s) => ({
                key: s.category,
                label: (
                  <>
                    {CATEGORY_LABEL[s.category]}
                    <span className="ml-2 font-normal text-fg-muted">{CATEGORY_DESCRIPTION[s.category]}</span>
                  </>
                ),
              })}
              rowActions={rowActions}
              empty={{ illustration: 'search', title: 'Nenhum status encontrado', description: 'Ajuste a busca ou o filtro.' }}
            />
          </div>
        </TabsContent>
        <TabsContent value="forms" className="outline-none">
          <div className="px-6 py-4">
            <Table<{ id: string; name: string }>
              id="admin-statuses-forms"
              aria-label="Status do ticket por formulário"
              columns={[
                { id: 'form', header: 'Formulário', label: 'Formulário', width: 240, cell: (f) => f.name },
                {
                  id: 'statuses',
                  header: 'Status disponíveis',
                  label: 'Status disponíveis',
                  width: 640,
                  cell: () => (
                    <span className="flex flex-wrap items-center gap-1">
                      {statuses.filter(isActive).map((s) => (
                        <StatusBadge key={s.id} status={s} />
                      ))}
                    </span>
                  ),
                },
              ]}
              rows={[{ id: 'default', name: 'Formulário padrão' }]}
              getRowId={(f) => f.id}
              loading={loading}
              error={tableError}
            />
          </div>
        </TabsContent>
      </Tabs>
      <StatusModal open={modal.open} status={modal.status} onOpenChange={(open) => setModal((m) => ({ ...m, open }))} />
    </div>
  );
}
