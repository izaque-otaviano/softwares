import { errMessage } from '@/lib/apiError';
import { IS_REAL } from '@/api/mode';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { metaApi, orgsApi, usersApi } from '@/api';
import { ProfileError, ProfileNotFound, ProfileSkeleton, PropertiesAside, Stamps } from '@/components/people/ProfileParts';
import { ProfileTickets } from '@/components/people/ProfileTickets';
import { goTo, openOrg, openUser } from '@/components/shell/openTab';
import {
  Avatar,
  Button,
  Combobox,
  ConfirmModal,
  EmptyState,
  Field,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  Pill,
  Select,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TagInput,
  Textarea,
  type ColumnDef,
} from '@/components/ui';
import { relativeTime } from '@/lib/time';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { toast, localSaved } from '@/store/useUi';
import type { Group, Org, User } from '@/types/domain';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'notfound' } | { status: 'ok'; org: Org };

const ACCESS_OPTIONS = [
  { value: 'own_tickets', label: 'Veem apenas os próprios tickets' },
  { value: 'org_tickets', label: 'Veem os tickets da organização' },
];

interface Draft {
  tags: string[];
  domains: string[];
  groupId: string;
  userAccess: Org['userAccess'];
  details: string;
  notes: string;
}
const toDraft = (o: Org): Draft => ({ tags: o.tags, domains: o.domains, groupId: o.groupId ?? '', userAccess: o.userAccess, details: o.details ?? '', notes: o.notes ?? '' });

export default function OrgPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ok', org: await orgsApi.getOrg(id) });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar a organização.';
      setState(/não encontrad/i.test(message) ? { status: 'notfound' } : { status: 'error', message });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <ProfileSkeleton label="Carregando organização" />;
  if (state.status === 'error') return <ProfileError message={state.message} onRetry={() => void load()} />;
  if (state.status === 'notfound')
    return <ProfileNotFound title="Organização não encontrada" description="Esta organização não existe ou foi apagada." backLabel="Ir para organizações" onBack={() => navigate('/agent/orgs')} />;
  return <OrgProfile key={state.org.id} org={state.org} onOrgChange={(o) => setState({ status: 'ok', org: o })} />;
}

function OrgProfile({ org, onOrgChange }: { org: Org; onOrgChange: (o: Org) => void }) {
  const tabKey = `org:${org.id}`;
  const [draft, setDraft] = useState<Draft>(() => toDraft(org));
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<User[] | null>(null);
  const [membersError, setMembersError] = useState(false);
  const [dialog, setDialog] = useState<null | 'add' | 'merge' | 'delete'>(null);
  const [tab, setTab] = useState('tickets');

  const tickets = useTickets((s) => s.tickets);
  const loaded = useTickets((s) => s.loaded);
  const ticketsError = useTickets((s) => s.error);

  const base = useMemo(() => toDraft(org), [org]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  const loadMembers = useCallback(async () => {
    setMembersError(false);
    try {
      setMembers(await usersApi.listUsers({ orgId: org.id }));
    } catch {
      setMembersError(true);
    }
  }, [org.id]);

  useEffect(() => {
    void loadMembers();
    metaApi.listGroups().then(setGroups).catch(() => {});
  }, [loadMembers]);

  useEffect(() => {
    useTabs.getState().setDirty(tabKey, dirty);
  }, [dirty, tabKey]);
  useEffect(() => () => useTabs.getState().setDirty(tabKey, false), [tabKey]);

  const [historyLoading, setHistoryLoading] = useState(IS_REAL);
  const [historyError, setHistoryError] = useState(false);
  // Modo real: os tickets da organização vêm do servidor (`?company=`), não só dos 100 primeiros da lista inicial.
  const loadHistory = useCallback(() => {
    if (!IS_REAL) return;
    setHistoryError(false);
    setHistoryLoading(true);
    useTickets
      .getState()
      .loadRelated({ orgId: org.id })
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  }, [org.id]);
  useEffect(loadHistory, [loadHistory]);

  const orgTickets = useMemo(() => {
    const ids = new Set((members ?? []).map((u) => u.id));
    return tickets.filter((t) => t.orgId === org.id || ids.has(t.requesterId));
  }, [tickets, members, org.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await orgsApi.updateOrg(org.id, { ...draft, groupId: draft.groupId || undefined });
      onOrgChange(updated);
      setDraft(toDraft(updated));
      toast.success('Organização atualizada');
    } catch (e) {
      toast.error(`${errMessage(e, 'Não foi possível salvar.')} Suas alterações foram mantidas.`);
    } finally {
      setSaving(false);
    }
  };

  const userColumns: ColumnDef<User>[] = [
    {
      id: 'name',
      header: 'Nome',
      label: 'Nome',
      width: 260,
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={u.name} size={24} decorative />
          <button type="button" className="min-w-0 truncate rounded text-left text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => openUser(u.id, u.name)}>
            {u.name}
          </button>
        </span>
      ),
    },
    { id: 'email', header: 'E-mail', label: 'E-mail', width: 260, cell: (u) => u.email },
    { id: 'tags', header: 'Tags', label: 'Tags', width: 200, cell: (u) => (u.tags.length ? <span className="flex gap-1">{u.tags.map((t) => <Pill key={t}>{t}</Pill>)}</span> : '-') },
    { id: 'updatedAt', header: 'Data da última atualização', label: 'Data da última atualização', width: 200, cell: (u) => (u.updatedAt ? relativeTime(u.updatedAt) : '-') },
  ];

  return (
    <div className="flex h-full min-h-0">
      <PropertiesAside
        label="Propriedades da organização"
        footer={
          dirty ? (
            <>
              <Button variant="outline" onClick={() => setDraft(base)}>
                Descartar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Salvar
              </Button>
            </>
          ) : undefined
        }
      >
        <Field label="Tags" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <TagInput value={draft.tags} onChange={(v) => set('tags', v)} placeholder="Adicionar tag" />
        </Field>
        <Field label="Domínios">
          <TagInput value={draft.domains} onChange={(v) => set('domains', v)} placeholder="Adicionar domínio" />
        </Field>
        <Field label="Grupo" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Select value={draft.groupId} onValueChange={(v) => set('groupId', v)} options={[{ value: '', label: '-' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        </Field>
        <Field label="Usuários" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Select value={draft.userAccess} onValueChange={(v) => set('userAccess', v as Org['userAccess'])} options={ACCESS_OPTIONS} />
        </Field>
        <Field label="Detalhes">
          <Textarea minRows={3} value={draft.details} onChange={(e) => set('details', e.target.value)} />
        </Field>
        <Field label="Observações">
          <Textarea minRows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Stamps items={[{ label: 'Criada', iso: org.createdAt }, { label: 'Atualizada', iso: org.updatedAt }]} />
      </PropertiesAside>

      <section aria-label="Perfil da organização" className="flex min-w-0 flex-1 flex-col px-6 pt-5">
        <header className="flex items-center justify-between gap-3 pb-4">
          <h1 className="min-w-0 truncate text-xl font-normal text-fg">{org.name}</h1>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="outline" trailingIcon={<ChevronDown />}>
                Ações
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => setDialog('add')}>Adicionar usuário</MenuItem>
              <MenuItem onSelect={() => setDialog('merge')}>Fundir em outra organização</MenuItem>
              <MenuSeparator />
              <MenuItem tone="danger" onSelect={() => setDialog('delete')}>
                Apagar organização
              </MenuItem>
            </MenuContent>
          </Menu>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList aria-label="Seções da organização">
            <TabsTrigger value="tickets" count={members ? orgTickets.length : undefined}>Tickets</TabsTrigger>
            <TabsTrigger value="users" count={members?.length}>Usuários</TabsTrigger>
            <TabsTrigger value="related">Relacionado</TabsTrigger>
          </TabsList>
          <TabsContent value="tickets" className="flex min-h-0 flex-1 flex-col">
            <ProfileTickets
              tableId="org-tickets"
              requested={orgTickets}
              loading={(!loaded && !ticketsError) || (members === null && !membersError) || historyLoading}
              error={historyError ? { message: 'Não foi possível carregar os tickets desta organização.', onRetry: loadHistory } : ticketsError && !loaded ? { message: 'Não foi possível carregar os tickets.', onRetry: () => void useTickets.getState().load() } : undefined}
            />
          </TabsContent>
          <TabsContent value="users" className="min-h-0 flex-1 pt-3">
            <Table<User>
              id="org-users"
              aria-label="Usuários da organização"
              columns={userColumns}
              rows={members ?? []}
              getRowId={(u) => u.id}
              getRowLabel={(u) => u.name}
              loading={members === null && !membersError}
              error={membersError ? { message: 'Não foi possível carregar os usuários.', onRetry: () => void loadMembers() } : undefined}
              empty={{ illustration: 'box', title: 'Nenhum usuário nesta organização', action: <Button variant="primary" onClick={() => setDialog('add')}>Adicionar usuário</Button> }}
              onRowClick={(u) => openUser(u.id, u.name)}
              resizable
              stickyHeader
              className="h-full"
            />
          </TabsContent>
          <TabsContent value="related">
            <EmptyState illustration="box" title="Libere o seu potencial" description="Aqui aparecerão itens relacionados a esta organização quando estiverem disponíveis." />
          </TabsContent>
        </Tabs>
      </section>

      <AddMemberModal open={dialog === 'add'} onOpenChange={(o) => !o && setDialog(null)} org={org} onAdded={() => void loadMembers()} />
      <MergeOrgModal open={dialog === 'merge'} onOpenChange={(o) => !o && setDialog(null)} org={org} />
      <ConfirmModal
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Apagar ${org.name}?`}
        description={IS_REAL ? 'O backend não apaga empresas: a organização será DESATIVADA e some das listas.' : 'Os usuários ficarão sem organização. Esta ação não pode ser desfeita.'}
        confirmLabel="Apagar organização"
        onConfirm={async () => {
          try {
            await orgsApi.deleteOrg(org.id);
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível apagar a organização. Tente novamente.'));
            throw e;
          }
          toast.success(IS_REAL ? `${org.name} foi desativada` : `${org.name} foi apagada`);
          useTabs.getState().closeTab(tabKey);
          goTo('/agent/orgs');
        }}
      />
    </div>
  );
}

function AddMemberModal({ open, onOpenChange, org, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; org: Org; onAdded: () => void }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setUserId(null);
  }, [open]);
  const loadOptions = useCallback(
    async (q: string) => (await usersApi.listUsers({ role: 'end_user', query: q })).filter((u) => u.orgId !== org.id).map((u) => ({ value: u.id, label: u.name, description: u.email })),
    [org.id],
  );
  const add = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const u = await usersApi.updateUser(userId, { orgId: org.id });
      toast.success(`${u.name} foi adicionado a ${org.name}`);
      onAdded();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível adicionar o usuário. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar usuário"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!userId} loading={busy} onClick={() => void add()}>
            Adicionar
          </Button>
        </>
      }
    >
      <Field label="Usuário">
        <Combobox value={userId} onValueChange={setUserId} loadOptions={loadOptions} placeholder="Selecione um usuário" searchPlaceholder="Pesquisar por nome ou e-mail" />
      </Field>
    </Modal>
  );
}

function MergeOrgModal({ open, onOpenChange, org }: { open: boolean; onOpenChange: (o: boolean) => void; org: Org }) {
  const [target, setTarget] = useState<string | null>(null);
  const [options, setOptions] = useState<Org[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTarget(null);
    orgsApi.listOrgs().then((l) => setOptions(l.filter((o) => o.id !== org.id))).catch(() => {});
  }, [open, org.id]);
  const merge = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const merged = await orgsApi.mergeOrgs(org.id, target);
      toast.success(localSaved(`${org.name} foi fundida em ${merged.name}`, 'merge'));
      useTabs.getState().closeTab(`org:${org.id}`);
      onOpenChange(false);
      openOrg(merged.id, merged.name);
    } catch {
      toast.error('Não foi possível fundir as organizações. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Fundir em outra organização"
      description={`Os usuários de ${org.name} passarão para a organização escolhida e esta será removida.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!target} loading={busy} onClick={() => void merge()}>
            Fundir
          </Button>
        </>
      }
    >
      <Field label="Organização de destino">
        <Combobox value={target} onValueChange={setTarget} placeholder="Selecione uma organização" searchPlaceholder="Pesquisar organização" options={options.map((o) => ({ value: o.id, label: o.name }))} />
      </Field>
    </Modal>
  );
}
