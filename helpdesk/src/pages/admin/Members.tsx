import { ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { membersApi, metaApi } from '@/api';
import type { Licenses, Member, StaffRole } from '@/api/members';
import { AdminBody, Toolbar } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { UserSecurityPanel } from '@/components/admin/security/UserSecurityPanel';
import { useAsync } from '@/components/admin/useAsync';
import {
  Avatar,
  Badge,
  Banner,
  Checkbox,
  Drawer,
  Button,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Modal,
  Select,
  Skeleton,
  Table,
  type ColumnDef,
  type MenuItemSpec,
} from '@/components/ui';
import { SETTINGS_MANAGE, useCan } from '@/lib/permissions';
import { relativeTime } from '@/lib/time';
import { toast } from '@/store/useUi';

const ROLE_FILTER = [
  { value: 'all', label: 'Todas as funções' },
  { value: 'admin', label: 'Administrador' },
  { value: 'agent', label: 'Agente' },
];

function CreateMemberModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const groups = useAsync(() => metaApi.listGroups());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('agent');
  const [groupId, setGroupId] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // Recusa do servidor (ex.: 409 `seat_limit_reached`): fica no modal e o que foi digitado é mantido.
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = !name.trim() ? 'Informe o nome.' : undefined;
  const emailError = !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Informe um e-mail válido.' : undefined;

  const reset = () => {
    setName('');
    setEmail('');
    setRole('agent');
    setGroupId('');
    setTouched(false);
    setServerError(null);
  };

  const submit = async () => {
    setTouched(true);
    if (nameError || emailError) return;
    setSaving(true);
    setServerError(null);
    try {
      await membersApi.createMember({ name, email, role, groupId: groupId || undefined });
      toast.success('Membro criado. O convite foi enviado por e-mail.');
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Não foi possível criar o membro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Criar membro da equipe"
      description="A pessoa recebe um convite por e-mail para definir a senha."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Criar membro
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {serverError ? (
          <Banner tone="error" title="Não foi possível criar o membro">
            {serverError}
          </Banner>
        ) : null}
        <Field label="Nome" required error={touched ? nameError : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail" required error={touched ? emailError : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Função">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as StaffRole)}
            options={[
              { value: 'agent', label: 'Agente' },
              { value: 'admin', label: 'Administrador' },
            ]}
          />
        </Field>
        <Field label="Grupo">
          <Select
            value={groupId}
            onValueChange={setGroupId}
            placeholder="Selecione um grupo"
            options={[{ value: '', label: 'Nenhum' }, ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))]}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Edição do total de licenças (só administrador): número ou "sem limite"; abaixo do uso o servidor recusa (400). */
function LicenseTotalModal({ open, onOpenChange, licenses, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; licenses: Licenses; onSaved: () => void }) {
  const [unlimited, setUnlimited] = useState(licenses.unlimited);
  const [value, setValue] = useState(licenses.total === null ? String(licenses.used) : String(licenses.total));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(value);
    if (!unlimited && (!value.trim() || !Number.isInteger(n) || n < 0)) {
      setError('Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await membersApi.setLicenseTotal(unlimited ? null : n);
      toast.success(unlimited ? 'Licenças de agente sem limite.' : `Total de licenças de agente: ${n}.`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError((e as { fieldErrors?: Record<string, string[]> }).fieldErrors?.total?.[0] ?? (e instanceof Error ? e.message : 'Não foi possível salvar o total.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title="Total de licenças de agente"
      description={`Hoje ${licenses.used} ${licenses.used === 1 ? 'licença está em uso' : 'licenças estão em uso'} (administradores, supervisores e agentes ativos; convite pendente conta). O total não pode ficar abaixo disso.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Total de licenças" error={error ?? undefined}>
          <Input inputMode="numeric" value={value} disabled={unlimited || saving} onChange={(e) => { setValue(e.target.value); setError(null); }} />
        </Field>
        <Checkbox label="Sem limite" checked={unlimited} disabled={saving} onCheckedChange={(c) => { setUnlimited(c === true); setError(null); }} />
      </div>
    </Modal>
  );
}

export default function Members() {
  const members = useAsync(() => membersApi.listMembers());
  const licenses = useAsync(() => membersApi.getLicenses());
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [creating, setCreating] = useState(false);
  const [securityOf, setSecurityOf] = useState<Member | null>(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const canManage = useCan(SETTINGS_MANAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members.data ?? []).filter(
      (m) => (role === 'all' || m.role === role) && (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)),
    );
  }, [members.data, query, role]);

  const reloadAll = () => {
    members.reload();
    licenses.reload();
  };

  const toggleSuspend = async (m: Member) => {
    try {
      await membersApi.setMemberSuspended(m.id, !m.suspended);
      toast.success(m.suspended ? `${m.name} foi reativado.` : `${m.name} foi suspenso.`);
      reloadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar o membro.');
    }
  };

  const columns: ColumnDef<Member>[] = [
    {
      id: 'member',
      header: 'Membro',
      label: 'Membro',
      width: 280,
      cell: (m) => (
        <span className="flex items-center gap-2">
          <Avatar name={m.name} size={24} decorative />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{m.name}</span>
            <span className="block truncate text-xs text-fg-muted">{m.email}</span>
          </span>
        </span>
      ),
    },
    { id: 'group', header: 'Grupo', label: 'Grupo', width: 160, cell: (m) => (m.groups.length ? m.groups.join(', ') : '—') },
    { id: 'access', header: 'Acesso a produtos', label: 'Acesso a produtos', width: 200, cell: (m) => m.productAccess },
    {
      id: 'role',
      header: 'Função',
      label: 'Função',
      width: 160,
      cell: (m) => (
        <span className="flex items-center gap-2">
          {m.roleLabel}
          {m.suspended ? <Badge size="sm">Suspenso</Badge> : null}
        </span>
      ),
    },
    {
      id: 'lastSeen',
      header: 'Último acesso',
      label: 'Último acesso',
      width: 180,
      cell: (m) =>
        m.pending ? <span className="text-fg-muted">Convite pendente</span> : m.lastSeenAt ? relativeTime(m.lastSeenAt) : <span className="text-fg-muted">-</span>,
    },
  ];

  const rowActions = (m: Member): MenuItemSpec[] => [
    { id: 'suspend', label: m.suspended ? 'Reativar' : 'Suspender', onSelect: () => void toggleSuspend(m) },
    { id: 'security', label: 'Sessões e acessos', onSelect: () => setSecurityOf(m) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Pessoas' }, { label: 'Membros da equipe' }]}
        title="Membros da equipe"
        description="Gerencie quem atende e administra a sua conta, suas funções e grupos."
        learnMoreHref="https://example.com/ajuda/membros"
        actions={
          <>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="outline" trailingIcon={<ChevronDown />}>
                  Ações
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => toast.info('Exportação não faz parte desta versão.')}>Exportar lista</MenuItem>
                <MenuItem onSelect={() => toast.info('Convites reenviados.')}>Reenviar convites pendentes</MenuItem>
              </MenuContent>
            </Menu>
            <Button variant="ink" onClick={() => setCreating(true)}>
              Criar membro da equipe
            </Button>
          </>
        }
      />
      <AdminBody>
        <div className="mb-4 max-w-xs rounded border border-line p-4">
          <p className="text-xs font-semibold text-fg-muted">Licenças</p>
          {licenses.data ? (
            <>
              <p className="mt-1 text-md">
                <span className="font-semibold">Agentes</span> {licenses.data.unlimited ? `${licenses.data.used} (sem limite)` : `${licenses.data.used} de ${licenses.data.total}`}
              </p>
              {!licenses.data.unlimited ? <p className="mt-0.5 text-xs text-fg-muted">{licenses.data.available === 1 ? '1 licença livre' : `${licenses.data.available} licenças livres`}</p> : null}
              {canManage ? (
                <button type="button" onClick={() => setEditingTotal(true)} className="mt-2 rounded text-sm text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                  Editar total
                </button>
              ) : null}
            </>
          ) : licenses.error ? (
            <button type="button" onClick={licenses.reload} className="mt-1 text-sm text-action hover:text-action-hover">
              Tentar novamente
            </button>
          ) : (
            <Skeleton className="mt-2" width="60%" />
          )}
        </div>
        <Toolbar>
          <Input
            type="search"
            aria-label="Pesquisar membros"
            placeholder="Pesquisar por nome ou e-mail"
            leadingIcon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72"
          />
          <Select aria-label="Filtrar por função" value={role} onValueChange={setRole} options={ROLE_FILTER} className="w-48" />
        </Toolbar>
        <Table
          id="admin-members"
          aria-label="Membros da equipe"
          columns={columns}
          rows={rows}
          getRowId={(m) => m.id}
          getRowLabel={(m) => m.name}
          loading={members.loading && !members.data}
          error={members.error && !members.data ? { message: members.error, onRetry: members.reload } : undefined}
          empty={{ title: 'Nenhum membro encontrado', description: 'Ajuste a pesquisa ou o filtro.' }}
          rowActions={rowActions}
        />
      </AdminBody>
      <Drawer
        open={securityOf !== null}
        onOpenChange={(o) => {
          if (!o) setSecurityOf(null);
        }}
        title={securityOf ? `Sessões e acessos de ${securityOf.name}` : 'Sessões e acessos'}
        width="w-[480px]"
      >
        {securityOf ? <UserSecurityPanel userId={securityOf.id} userName={securityOf.name} canManage /> : null}
      </Drawer>
      <CreateMemberModal open={creating} onOpenChange={setCreating} onCreated={reloadAll} />
      {licenses.data && editingTotal ? <LicenseTotalModal key={String(licenses.data.total)} open onOpenChange={setEditingTotal} licenses={licenses.data} onSaved={reloadAll} /> : null}
    </>
  );
}
