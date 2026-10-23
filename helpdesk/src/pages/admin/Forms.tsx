import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formsApi } from '@/api';
import { ApiError } from '@/api/errors';
import { AdminBody, Toolbar } from '@/components/admin/AdminPage';
import { FormModal } from '@/components/admin/FormModal';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { Badge, Button, ConfirmModal, Input, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { TYPE_LABEL } from '@/lib/status';
import { useRefData } from '@/store/useRefData';
import { toast } from '@/store/useUi';
import type { TicketForm } from '@/types/domain';

export default function Forms() {
  const { data, loading, error, reload: reloadList } = useAsync(() => formsApi.listForms());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TicketForm | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TicketForm | null>(null);
  /** Formulário com tickets (409 `form_in_use`): sugere desativar. */
  const [inUse, setInUse] = useState<TicketForm | null>(null);

  const reload = () => {
    reloadList();
    void useRefData.getState().refreshCustom();
  };
  const forms = data ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return forms.filter((f) => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
  }, [forms, query]);

  const run = async (action: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await action();
      toast.success(ok);
      reload();
    } catch (e) {
      // 409 (`default_form_required`...) e 403 trazem a frase pronta do servidor.
      toast.error(e instanceof Error && e.message ? e.message : fail);
    }
  };

  const move = (f: TicketForm, delta: -1 | 1) => {
    const ids = forms.map((x) => x.id);
    const i = ids.indexOf(f.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => formsApi.reorderForms(ids), `"${f.name}" ${delta < 0 ? 'subiu' : 'desceu'} na lista.`, 'Não foi possível reordenar os formulários.');
  };

  const columns: ColumnDef<TicketForm>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      width: 260,
      cell: (f) => (
        <button type="button" onClick={() => setEditing(f)} className="max-w-full truncate rounded-xs text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
          {f.name}
        </button>
      ),
    },
    {
      id: 'flags',
      header: 'Situação',
      label: 'Situação',
      hideable: true,
      width: 190,
      cell: (f) => (
        <span className="flex items-center gap-1">
          {f.isDefault ? <Badge size="sm">Padrão</Badge> : null}
          <Badge size="sm">{f.active ? 'Ativo' : 'Inativo'}</Badge>
        </span>
      ),
    },
    { id: 'fields', header: 'Campos', label: 'Campos', hideable: true, width: 100, cell: (f) => f.fields.length },
    { id: 'team', header: 'Equipe padrão', label: 'Equipe padrão', hideable: true, width: 170, cell: (f) => f.defaultTeamName ?? '—' },
    { id: 'type', header: 'Tipo padrão', label: 'Tipo padrão', hideable: true, width: 140, cell: (f) => (f.defaultType ? TYPE_LABEL[f.defaultType] : '—') },
    { id: 'tickets', header: 'Tickets', label: 'Tickets', hideable: true, width: 100, cell: (f) => f.ticketCount },
  ];

  const rowActions = (f: TicketForm): MenuItemSpec[] => {
    const at = forms.findIndex((x) => x.id === f.id);
    return [
      { id: 'edit', label: 'Editar', onSelect: () => setEditing(f) },
      { id: 'default', label: 'Definir como padrão', disabled: f.isDefault || !f.active, onSelect: () => void run(() => formsApi.updateForm(f.id, { isDefault: true }), `"${f.name}" agora é o formulário padrão.`, 'Não foi possível trocar o padrão.') },
      { id: 'clone', label: 'Clonar', onSelect: () => void run(() => formsApi.cloneForm(f.id), 'Formulário clonado.', 'Não foi possível clonar o formulário.') },
      { id: 'up', label: 'Mover para cima', disabled: at <= 0 || query !== '', onSelect: () => move(f, -1) },
      { id: 'down', label: 'Mover para baixo', disabled: at < 0 || at >= forms.length - 1 || query !== '', onSelect: () => move(f, 1) },
      {
        id: 'toggle',
        label: f.active ? 'Desativar' : 'Ativar',
        onSelect: () => void run(() => formsApi.updateForm(f.id, { active: !f.active }), f.active ? `Formulário "${f.name}" desativado.` : `Formulário "${f.name}" ativado.`, 'Não foi possível atualizar o formulário.'),
      },
      { id: 'delete', label: 'Apagar', tone: 'danger', onSelect: () => setDeleting(f) },
    ];
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Objetos e regras' }, { label: 'Formulários' }]}
        title="Formulários"
        description="Um formulário é a lista de campos que a equipe vê no ticket, na ordem e com o que é obrigatório, mais a equipe e o tipo padrão. Há sempre um formulário padrão. Só a equipe usa: o cliente nunca vê estes campos."
        actions={
          <Button variant="ink" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
            Adicionar formulário
          </Button>
        }
      />
      <AdminBody>
        <Toolbar>
          <Input type="search" aria-label="Pesquisar formulários" placeholder="Pesquisar formulários" leadingIcon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} className="w-72" />
        </Toolbar>
        <Table
          id="admin-forms"
          aria-label="Formulários"
          columns={columns}
          rows={rows}
          getRowId={(f) => f.id}
          getRowLabel={(f) => f.name}
          loading={loading && !data}
          error={error && !data ? { message: error, onRetry: reload } : undefined}
          empty={{ title: 'Nenhum formulário encontrado', description: 'Ajuste a pesquisa.' }}
          rowActions={rowActions}
          resizable
        />
      </AdminBody>
      <FormModal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} form={editing && editing !== 'new' ? editing : undefined} onSaved={reload} />
      <ConfirmModal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Apagar formulário?"
        description={deleting ? `O formulário "${deleting.name}" será apagado. Esta ação não pode ser desfeita. Formulário padrão ou com tickets não pode ser apagado: nesse caso você poderá desativá-lo.` : undefined}
        confirmLabel="Apagar formulário"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await formsApi.deleteForm(deleting.id);
            toast.success('Formulário apagado.');
            reload();
          } catch (e) {
            if (e instanceof ApiError && e.status === 409 && e.code === 'form_in_use') {
              setInUse(deleting);
              setDeleting(null);
              return;
            }
            // `default_form_required`: a frase do servidor já manda escolher outro padrão antes.
            toast.error(e instanceof Error ? e.message : 'Não foi possível apagar o formulário.');
            throw e;
          }
        }}
      />
      <ConfirmModal
        open={inUse !== null}
        onOpenChange={(o) => !o && setInUse(null)}
        tone="primary"
        title="Há tickets usando este formulário"
        description={inUse ? `O formulário "${inUse.name}" tem tickets e não pode ser apagado. Desative-o: ele deixa de ser oferecido em tickets novos, e os existentes continuam com ele.` : undefined}
        confirmLabel="Desativar formulário"
        cancelLabel="Manter ativo"
        onConfirm={async () => {
          if (!inUse) return;
          try {
            await formsApi.updateForm(inUse.id, { active: false });
            toast.success(`Formulário "${inUse.name}" desativado.`);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Não foi possível desativar o formulário.');
            throw e;
          }
        }}
      />
    </>
  );
}
