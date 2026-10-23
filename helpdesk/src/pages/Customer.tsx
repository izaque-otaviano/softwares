import { errMessage } from '@/lib/apiError';
import { IS_REAL } from '@/api/mode';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { orgsApi, usersApi } from '@/api';
import { EMAIL_RE, LANGUAGE_OPTIONS, TIMEZONE_OPTIONS, openNewTicketFor, withCurrent } from '@/components/people/peopleUtils';
import { ProfileError, ProfileNotFound, ProfileSkeleton, PropertiesAside, Stamps } from '@/components/people/ProfileParts';
import { ProfileTickets } from '@/components/people/ProfileTickets';
import { goTo, openUser } from '@/components/shell/openTab';
import {
  Avatar,
  Button,
  Combobox,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  SplitButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TagInput,
  type SplitItem,
} from '@/components/ui';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { toast, localSaved } from '@/store/useUi';
import type { Org, User } from '@/types/domain';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'notfound' } | { status: 'ok'; user: User };

const ROLE_OPTIONS = [
  { value: 'end_user', label: 'Cliente' },
  { value: 'agent', label: 'Agente' },
  { value: 'admin', label: 'Administrador' },
];
const ACCESS_OPTIONS = [
  { value: 'active', label: 'Pode acessar a central de ajuda' },
  { value: 'suspended', label: 'Suspenso' },
];

interface Draft {
  role: User['role'];
  suspended: boolean;
  email: string;
  extraEmails: string[];
  tags: string[];
  orgId: string | null;
  language: string;
  timezone: string;
  details: string;
  notes: string;
}

const toDraft = (u: User): Draft => ({
  role: u.role,
  suspended: Boolean(u.suspended),
  email: u.email,
  extraEmails: u.extraEmails ?? [],
  tags: u.tags,
  orgId: u.orgId ?? null,
  language: u.language,
  timezone: u.timezone,
  details: u.details ?? '',
  notes: u.notes ?? '',
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

export default function Customer() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ok', user: await usersApi.getUser(id) });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar o cliente.';
      setState(/não encontrad/i.test(message) ? { status: 'notfound' } : { status: 'error', message });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <ProfileSkeleton label="Carregando cliente" />;
  if (state.status === 'error') return <ProfileError message={state.message} onRetry={() => void load()} />;
  if (state.status === 'notfound')
    return <ProfileNotFound title="Cliente não encontrado" description="Este cliente não existe ou foi apagado." backLabel="Ir para clientes" onBack={() => navigate('/agent/customers')} />;
  return <CustomerProfile key={state.user.id} user={state.user} onUserChange={(u) => setState({ status: 'ok', user: u })} />;
}

function CustomerProfile({ user, onUserChange }: { user: User; onUserChange: (u: User) => void }) {
  const tabKey = `user:${user.id}`;
  const [draft, setDraft] = useState<Draft>(() => toDraft(user));
  const [errors, setErrors] = useState<{ email?: string; extra?: string }>({});
  const [saving, setSaving] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [dialog, setDialog] = useState<null | 'merge' | 'delete'>(null);
  const [tab, setTab] = useState('tickets');

  const tickets = useTickets((s) => s.tickets);
  const loaded = useTickets((s) => s.loaded);
  const ticketsError = useTickets((s) => s.error);
  const [historyLoading, setHistoryLoading] = useState(IS_REAL);
  const [historyError, setHistoryError] = useState(false);
  // Modo real: o histórico vem do servidor (`?requester=`), não só dos 100 primeiros tickets da lista inicial.
  const loadHistory = useCallback(() => {
    if (!IS_REAL) return;
    setHistoryError(false);
    setHistoryLoading(true);
    useTickets
      .getState()
      .loadRelated({ requesterId: user.id })
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  }, [user.id]);
  useEffect(loadHistory, [loadHistory]);
  const requested = useMemo(() => tickets.filter((t) => t.requesterId === user.id), [tickets, user.id]);
  const cc = useMemo(() => tickets.filter((t) => t.ccIds.includes(user.id)), [tickets, user.id]);

  const base = useMemo(() => toDraft(user), [user]);
  const dirty = !sameDraft(draft, base);

  useEffect(() => {
    orgsApi.listOrgs().then(setOrgs).catch(() => {});
  }, []);

  useEffect(() => {
    useTabs.getState().setDirty(tabKey, dirty);
  }, [dirty, tabKey]);
  useEffect(() => () => useTabs.getState().setDirty(tabKey, false), [tabKey]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const next: typeof errors = {};
    if (!EMAIL_RE.test(draft.email.trim())) next.email = 'Informe um e-mail válido.';
    if (draft.extraEmails.some((e) => !EMAIL_RE.test(e.trim()))) next.extra = 'Há um contato com e-mail inválido.';
    setErrors(next);
    if (next.email || next.extra) return;
    setSaving(true);
    try {
      const updated = await usersApi.updateUser(user.id, {
        role: draft.role,
        suspended: draft.suspended,
        email: draft.email.trim(),
        extraEmails: draft.extraEmails.map((e) => e.trim()).filter(Boolean),
        tags: draft.tags,
        orgId: draft.orgId ?? undefined,
        language: draft.language,
        timezone: draft.timezone,
        details: draft.details,
        notes: draft.notes,
      });
      onUserChange(updated);
      setDraft(toDraft(updated));
      useTabs.getState().updateTab(tabKey, { title: updated.name, subtitle: updated.email });
      toast.success('Cliente atualizado');
    } catch (e) {
      toast.error(`${errMessage(e, 'Não foi possível salvar.')} Suas alterações foram mantidas.`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSuspend = async () => {
    try {
      const updated = await usersApi.updateUser(user.id, { suspended: !user.suspended });
      onUserChange(updated);
      toast.success(updated.suspended ? `${user.name} foi suspenso` : `${user.name} foi reativado`);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível alterar o acesso. Tente novamente.'));
    }
  };

  const items: SplitItem[] = [
    { id: 'merge', label: 'Fundir em outro usuário' },
    { id: 'suspend', label: user.suspended ? 'Reativar' : 'Suspender' },
    { id: 'delete', label: <span className="text-danger">Apagar</span>, separatorBefore: true },
  ];

  return (
    <div className="flex h-full min-h-0">
      <PropertiesAside
        label="Propriedades do cliente"
        footer={
          dirty ? (
            <>
              <Button variant="outline" onClick={() => { setDraft(base); setErrors({}); }}>
                Descartar
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Salvar
              </Button>
            </>
          ) : undefined
        }
      >
        <Field label="Tipo de usuário" hint={IS_REAL ? 'O tipo vem do backend e não é alterado aqui.' : undefined}>
          <Select value={draft.role} onValueChange={(v) => set('role', v as User['role'])} options={ROLE_OPTIONS} />
        </Field>
        <Field label="Acesso">
          <Select value={draft.suspended ? 'suspended' : 'active'} onValueChange={(v) => set('suspended', v === 'suspended')} options={ACCESS_OPTIONS} />
        </Field>
        <Field label="E-mail principal" error={errors.email} required>
          <Input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        {draft.extraEmails.map((email, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input aria-label={`Contato adicional ${i + 1}`} type="email" value={email} onChange={(e) => set('extraEmails', draft.extraEmails.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" aria-label={`Remover contato adicional ${i + 1}`} className="rounded p-1 text-fg-muted hover:bg-hover hover:text-fg focus-visible:shadow-focus focus-visible:outline-none" onClick={() => set('extraEmails', draft.extraEmails.filter((_, j) => j !== i))}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        {errors.extra ? <p className="text-xs text-danger">{errors.extra}</p> : null}
        <button type="button" className="inline-flex items-center gap-1 rounded text-sm text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none" onClick={() => set('extraEmails', [...draft.extraEmails, ''])}>
          <Plus aria-hidden className="h-4 w-4" /> adicionar contato
        </button>
        <Field label="Tags" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <TagInput value={draft.tags} onChange={(v) => set('tags', v)} placeholder="Adicionar tag" />
        </Field>
        <Field label="Org.">
          <Combobox
            value={draft.orgId}
            onValueChange={(v) => set('orgId', v)}
            clearable
            placeholder="-"
            searchPlaceholder="Pesquisar organização"
            options={orgs.map((o) => ({ value: o.id, label: o.name }))}
          />
        </Field>
        <Field label="Idioma" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Select value={draft.language} onValueChange={(v) => set('language', v)} options={withCurrent(LANGUAGE_OPTIONS, draft.language)} />
        </Field>
        <Field label="Fuso horário" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Select value={draft.timezone} onValueChange={(v) => set('timezone', v)} options={withCurrent(TIMEZONE_OPTIONS, draft.timezone)} />
        </Field>
        <Field label="Detalhes">
          <Textarea minRows={3} value={draft.details} onChange={(e) => set('details', e.target.value)} />
        </Field>
        <Field label="Observações" hint={IS_REAL ? 'Somente neste navegador.' : undefined}>
          <Textarea minRows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <Stamps
          items={[
            { label: 'Criado', iso: user.createdAt },
            { label: 'Atualizado', iso: user.updatedAt },
            { label: 'Último acesso', iso: user.lastSeenAt },
          ]}
        />
      </PropertiesAside>

      <section aria-label="Perfil do cliente" className="flex min-w-0 flex-1 flex-col px-6 pt-5">
        <header className="flex items-center justify-between gap-3 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={user.name} size={40} decorative />
            <h1 className="min-w-0 truncate text-xl font-normal text-fg">{user.name}</h1>
          </div>
          <SplitButton
            label="+ Novo ticket"
            menuLabel="Mais ações do cliente"
            onClick={() => openNewTicketFor(user.id)}
            items={items}
            onSelectItem={(item) => {
              if (item.id === 'merge') setDialog('merge');
              else if (item.id === 'suspend') void toggleSuspend();
              else if (item.id === 'delete') setDialog('delete');
            }}
          />
        </header>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList aria-label="Seções do perfil">
            <TabsTrigger value="tickets" count={requested.length}>Tickets</TabsTrigger>
            <TabsTrigger value="related">Relacionado</TabsTrigger>
            <TabsTrigger value="security">Configurações de segurança</TabsTrigger>
          </TabsList>
          <TabsContent value="tickets" className="flex min-h-0 flex-1 flex-col">
            <ProfileTickets
              tableId="customer-tickets"
              requested={requested}
              cc={cc}
              loading={(!loaded && !ticketsError) || historyLoading}
              error={historyError ? { message: 'Não foi possível carregar os tickets deste cliente.', onRetry: loadHistory } : ticketsError && !loaded ? { message: 'Não foi possível carregar os tickets.', onRetry: () => void useTickets.getState().load() } : undefined}
            />
          </TabsContent>
          <TabsContent value="related">
            <EmptyState illustration="box" title="Libere o seu potencial" description="Aqui aparecerão itens relacionados a este cliente, como conversas paralelas e artigos, quando estiverem disponíveis." />
          </TabsContent>
          <TabsContent value="security" className="py-4">
            <dl className="max-w-md space-y-1">
              <dt className="text-xs font-semibold text-fg-muted">Senha</dt>
              <dd className="flex items-center gap-3 text-sm text-fg">
                <span aria-label="Senha oculta">●●●●●●●●●●</span>
                <button
                  type="button"
                  className="rounded text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                  onClick={() => toast.success(`Enviamos um e-mail de redefinição de senha para ${user.email}`)}
                >
                  Redefinir
                </button>
              </dd>
            </dl>
          </TabsContent>
        </Tabs>
      </section>

      <MergeModal open={dialog === 'merge'} onOpenChange={(o) => !o && setDialog(null)} user={user} />
      <ConfirmModal
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Apagar ${user.name}?`}
        description={IS_REAL ? 'O backend não apaga usuários: o cliente será DESATIVADO (sai das listas e não entra mais).' : 'O cliente será removido permanentemente. Esta ação não pode ser desfeita.'}
        confirmLabel="Apagar"
        onConfirm={async () => {
          try {
            await usersApi.deleteUser(user.id);
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível apagar o cliente. Tente novamente.'));
            throw e;
          }
          toast.success(IS_REAL ? `${user.name} foi desativado` : `${user.name} foi apagado`);
          useTabs.getState().closeTab(tabKey);
          goTo('/agent/customers');
        }}
      />
    </div>
  );
}

function MergeModal({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: User }) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTarget(null);
  }, [open]);

  const loadOptions = useCallback(
    async (q: string) => (await usersApi.listUsers({ role: 'end_user', query: q })).filter((u) => u.id !== user.id).map((u) => ({ value: u.id, label: u.name, description: u.email })),
    [user.id],
  );

  const merge = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const merged = await usersApi.mergeUsers(user.id, target);
      toast.success(localSaved(`${user.name} foi fundido em ${merged.name}`, 'merge'));
      void useTickets.getState().load();
      useTabs.getState().closeTab(`user:${user.id}`);
      onOpenChange(false);
      openUser(merged.id, merged.name);
    } catch {
      toast.error('Não foi possível fundir os usuários. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Fundir em outro usuário"
      description={`Os tickets de ${user.name} passarão para o usuário escolhido e este perfil será removido.`}
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
      <Field label="Usuário de destino">
        <Combobox value={target} onValueChange={setTarget} loadOptions={loadOptions} placeholder="Selecione um usuário" searchPlaceholder="Pesquisar por nome ou e-mail" />
      </Field>
    </Modal>
  );
}
