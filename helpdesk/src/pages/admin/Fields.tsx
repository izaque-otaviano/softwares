import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fieldsApi } from '@/api';
import { IS_REAL } from '@/api/mode';
import { ApiError } from '@/api/errors';
import { AdminBody, Toolbar } from '@/components/admin/AdminPage';
import { FieldModal } from '@/components/admin/FieldModal';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import {
  Badge,
  Button,
  ColumnsMenu,
  ConfirmModal,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Pill,
  Table,
  type ColumnDef,
  type MenuItemSpec,
  type SortState,
} from '@/components/ui';
import { FIELD_TYPE_LABEL } from '@/lib/customFields';
import { AI_FIELDS, AI_FIELD_IDS, STANDARD_FIELDS } from '@/lib/systemFields';
import { absoluteTime } from '@/lib/time';
import { useRefData } from '@/store/useRefData';
import { toast } from '@/store/useUi';
import type { TicketField } from '@/types/domain';

type StatusFilter = 'active' | 'inactive' | 'all';
const FILTER_LABEL: Record<Exclude<StatusFilter, 'all'>, string> = { active: 'Ativos', inactive: 'Inativos' };

/** Campos padrão do front (assunto, responsável... e os campos de IA locais): só leitura. */
const SYSTEM_ROWS: TicketField[] = [...STANDARD_FIELDS, ...AI_FIELDS];
const rowId = (f: TicketField): string => (f.system ? `sys:${f.id}` : f.id);

export default function Fields() {
  const { data, loading, error, reload: reloadList } = useAsync(() => fieldsApi.listFields());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortState | null>(null);
  const [editing, setEditing] = useState<TicketField | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TicketField | null>(null);
  /** Campo que já teve valor (409 `field_in_use`): sugere desativar em vez de apagar. */
  const [inUse, setInUse] = useState<TicketField | null>(null);

  // O painel do ticket e a validação de obrigatórios leem o mesmo cadastro: recarrega depois de qualquer mudança.
  const reload = () => {
    reloadList();
    void useRefData.getState().refreshCustom();
  };

  const custom = data ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...custom, ...SYSTEM_ROWS].filter(
      (f) =>
        (filter === 'all' || (filter === 'active' ? f.active : !f.active)) &&
        (!q || f.title.toLowerCase().includes(q) || (f.slug ?? f.id).toLowerCase().includes(q)),
    );
    if (!sort) return list;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const key = (f: TicketField) => (sort.columnId === 'modified' ? (f.updatedAt ?? '') : sort.columnId === 'id' ? (f.slug ?? f.id) : f.title);
    return [...list].sort((a, b) => key(a).localeCompare(key(b), 'pt-BR') * dir);
  }, [custom, query, filter, sort]);

  const toggleActive = async (f: TicketField) => {
    try {
      await fieldsApi.setFieldActive(f.id, !f.active);
      toast.success(f.active ? `Campo "${f.title}" desativado.` : `Campo "${f.title}" ativado.`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar o campo.');
    }
  };

  /** Sobe/desce o campo entre os visíveis (a posição vale para todos os formulários e para o cadastro). */
  const move = async (f: TicketField, delta: -1 | 1) => {
    const visible = rows.filter((r) => !r.system);
    const from = visible.findIndex((r) => r.id === f.id);
    const neighbour = visible[from + delta];
    if (!neighbour) return;
    const ids = custom.map((c) => c.id);
    const i = ids.indexOf(f.id);
    const j = ids.indexOf(neighbour.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await fieldsApi.reorderFields(ids);
      toast.success(`"${f.title}" ${delta < 0 ? 'subiu' : 'desceu'} na lista.`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível reordenar os campos.');
    }
  };

  const columns: ColumnDef<TicketField>[] = [
    {
      id: 'title',
      header: 'Nome de exibição',
      label: 'Nome de exibição',
      sortable: true,
      width: 260,
      cell: (f) => (
        f.system ? (
          <span className="max-w-full truncate">{f.title}</span>
        ) : (
          <button type="button" onClick={() => setEditing(f)} className="max-w-full truncate rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {f.title}
          </button>
        )
      ),
    },
    { id: 'id', header: 'Identificador', label: 'Identificador', sortable: true, hideable: true, width: 200, cell: (f) => <code className="text-xs text-fg-muted">{f.slug ?? f.id}</code> },
    { id: 'type', header: 'Tipo', label: 'Tipo', hideable: true, width: 150, cell: (f) => (f.system ? '—' : FIELD_TYPE_LABEL[f.type]) },
    { id: 'required', header: 'Obrigatório', label: 'Obrigatório', hideable: true, width: 120, cell: (f) => (f.system ? (f.required ? 'Sim' : '—') : f.required ? 'Sim' : 'Não') },
    { id: 'uses', header: 'Tickets com valor', label: 'Tickets com valor', hideable: true, width: 150, cell: (f) => (f.system || f.valuesCount === undefined ? '—' : f.valuesCount) },
    {
      id: 'modified',
      header: 'Data da modificação',
      label: 'Data da modificação',
      sortable: true,
      hideable: true,
      width: 190,
      cell: (f) => (f.updatedAt ? absoluteTime(f.updatedAt) : '—'),
    },
    {
      id: 'tags',
      header: 'Tags',
      label: 'Tags',
      hideable: true,
      width: 200,
      cell: (f) => (
        <span className="flex items-center gap-1">
          {f.system ? <Badge size="sm">Campo padrão</Badge> : null}
          {f.system && IS_REAL && AI_FIELD_IDS.has(f.id) ? <Badge size="sm">Somente neste navegador</Badge> : null}
          {!f.active ? <Badge size="sm">Inativo</Badge> : null}
        </span>
      ),
    },
  ];

  const rowActions = (f: TicketField): MenuItemSpec[] => {
    if (f.system) return [];
    const visible = rows.filter((r) => !r.system);
    const at = visible.findIndex((r) => r.id === f.id);
    return [
      { id: 'edit', label: 'Editar', onSelect: () => setEditing(f) },
      { id: 'up', label: 'Mover para cima', disabled: at <= 0 || sort !== null, onSelect: () => void move(f, -1) },
      { id: 'down', label: 'Mover para baixo', disabled: at < 0 || at >= visible.length - 1 || sort !== null, onSelect: () => void move(f, 1) },
      { id: 'toggle', label: f.active ? 'Desativar' : 'Ativar', onSelect: () => void toggleActive(f) },
      { id: 'delete', label: 'Apagar', tone: 'danger', onSelect: () => setDeleting(f) },
    ];
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Objetos e regras' }, { label: 'Campos' }]}
        title="Campos"
        description="Campos personalizados coletam informações só da equipe nos tickets (o cliente nunca os vê). Para aparecer no ticket, o campo precisa estar em um formulário. Os campos padrão não podem ser editados, desativados nem apagados."
        learnMoreHref="https://example.com/ajuda/campos"
        actions={
          <Button variant="ink" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
            Adicionar campo
          </Button>
        }
      />
      <AdminBody>
        <Toolbar>
          <Input
            type="search"
            aria-label="Pesquisar campos"
            placeholder="Pesquisar campos"
            leadingIcon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72"
          />
          <Menu>
            <MenuTrigger asChild>
              <Button variant="outline" trailingIcon={<ChevronDown />}>
                Status
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem checked={filter === 'active'} onSelect={() => setFilter('active')}>
                Ativos
              </MenuItem>
              <MenuItem checked={filter === 'inactive'} onSelect={() => setFilter('inactive')}>
                Inativos
              </MenuItem>
              <MenuItem checked={filter === 'all'} onSelect={() => setFilter('all')}>
                Todos
              </MenuItem>
            </MenuContent>
          </Menu>
          {filter !== 'all' ? (
            <Pill tone="action" onRemove={() => setFilter('all')} removeLabel={`Remover filtro ${FILTER_LABEL[filter]}`}>
              {FILTER_LABEL[filter]}
            </Pill>
          ) : null}
          <div className="flex-1" />
          <ColumnsMenu id="admin-fields" columns={columns} label="Colunas" />
        </Toolbar>
        <Table
          id="admin-fields"
          aria-label="Campos"
          columns={columns}
          rows={rows}
          getRowId={rowId}
          getRowLabel={(f) => f.title}
          loading={loading && !data}
          error={error && !data ? { message: error, onRetry: reload } : undefined}
          empty={{ title: 'Nenhum campo encontrado', description: 'Ajuste a pesquisa ou o filtro.' }}
          sort={sort}
          onSortChange={setSort}
          rowActions={rowActions}
          resizable
        />
      </AdminBody>
      <FieldModal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} field={editing && editing !== 'new' ? editing : undefined} onSaved={reload} />
      <ConfirmModal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Apagar campo?"
        description={deleting ? `O campo "${deleting.title}" será removido dos formulários. Esta ação não pode ser desfeita. Campos que já foram usados em tickets não podem ser apagados: nesse caso você poderá desativá-lo.` : undefined}
        confirmLabel="Apagar campo"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await fieldsApi.deleteField(deleting.id);
            toast.success('Campo apagado.');
            reload();
          } catch (e) {
            if (e instanceof ApiError && e.status === 409 && e.code === 'field_in_use') {
              // Já teve valor em algum ticket: o servidor não apaga. Em vez de só falhar, sugere desativar.
              setInUse(deleting);
              setDeleting(null);
              return;
            }
            toast.error(e instanceof Error ? e.message : 'Não foi possível apagar o campo.');
            throw e;
          }
        }}
      />
      <ConfirmModal
        open={inUse !== null}
        onOpenChange={(o) => !o && setInUse(null)}
        tone="primary"
        title="Este campo já foi usado em tickets"
        description={inUse ? `O campo "${inUse.title}" tem valores em tickets e não pode ser apagado. Desative-o para escondê-lo do painel (os valores continuam nos tickets, só para leitura).` : undefined}
        confirmLabel="Desativar campo"
        cancelLabel="Manter ativo"
        onConfirm={async () => {
          if (!inUse) return;
          try {
            await fieldsApi.setFieldActive(inUse.id, false);
            toast.success(`Campo "${inUse.title}" desativado.`);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível desativar o campo.');
            throw e;
          }
        }}
      />
    </>
  );
}
