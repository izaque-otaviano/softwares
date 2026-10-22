import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fieldsApi } from '@/api';
import { AdminBody, Toolbar } from '@/components/admin/AdminPage';
import { FIELD_TYPE_LABEL, FieldModal } from '@/components/admin/FieldModal';
import { RealModeNotice } from '@/components/shell/RealModeNotice';
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
import { absoluteTime } from '@/lib/time';
import { toast } from '@/store/useUi';
import type { TicketField } from '@/types/domain';

type StatusFilter = 'active' | 'inactive' | 'all';
const FILTER_LABEL: Record<Exclude<StatusFilter, 'all'>, string> = { active: 'Ativos', inactive: 'Inativos' };

export default function Fields() {
  const { data, loading, error, reload } = useAsync(() => fieldsApi.listFields());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortState | null>(null);
  const [editing, setEditing] = useState<TicketField | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TicketField | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data ?? []).filter(
      (f) =>
        (filter === 'all' || (filter === 'active' ? f.active : !f.active)) &&
        (!q || f.title.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)),
    );
    if (!sort) return list;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const key = (f: TicketField) => (sort.columnId === 'modified' ? (f.updatedAt ?? '') : sort.columnId === 'id' ? f.id : f.title);
    return [...list].sort((a, b) => key(a).localeCompare(key(b), 'pt-BR') * dir);
  }, [data, query, filter, sort]);

  const toggleActive = async (f: TicketField) => {
    try {
      await fieldsApi.setFieldActive(f.id, !f.active);
      toast.success(f.active ? `Campo "${f.title}" desativado.` : `Campo "${f.title}" ativado.`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar o campo.');
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
        <button type="button" onClick={() => setEditing(f)} className="max-w-full truncate rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
          {f.title}
        </button>
      ),
    },
    { id: 'id', header: 'ID do campo', label: 'ID do campo', sortable: true, hideable: true, width: 200, cell: (f) => <code className="text-xs text-fg-muted">{f.id}</code> },
    { id: 'type', header: 'Tipo', label: 'Tipo', hideable: true, width: 150, cell: (f) => FIELD_TYPE_LABEL[f.type] },
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
          {!f.active ? <Badge size="sm">Inativo</Badge> : null}
        </span>
      ),
    },
  ];

  const rowActions = (f: TicketField): MenuItemSpec[] => [
    { id: 'edit', label: 'Editar', onSelect: () => setEditing(f) },
    { id: 'toggle', label: f.active ? 'Desativar' : 'Ativar', disabled: f.system, onSelect: () => void toggleActive(f) },
    { id: 'delete', label: 'Apagar', tone: 'danger', disabled: f.system, onSelect: () => setDeleting(f) },
  ];

  return (
    <>
      <RealModeNotice feature="customFields">Campos personalizados ainda não existem no backend: valem somente neste navegador.</RealModeNotice>
      <PageHeader
        breadcrumb={[{ label: 'Objetos e regras' }, { label: 'Campos' }]}
        title="Campos"
        description="Campos coletam informações nos tickets. Os campos padrão não podem ser desativados nem apagados."
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
          getRowId={(f) => f.id}
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
        description={deleting ? `O campo "${deleting.title}" será removido dos tickets. Esta ação não pode ser desfeita.` : undefined}
        confirmLabel="Apagar campo"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await fieldsApi.deleteField(deleting.id);
            toast.success('Campo apagado.');
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível apagar o campo.');
            throw e;
          }
        }}
      />
    </>
  );
}
