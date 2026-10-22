import { ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { membersApi, metaApi } from '@/api';
import type { Member, StaffRole } from '@/api/members';
import { AdminBody, Toolbar } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import {
  Avatar,
  Badge,
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

  const nameError = !name.trim() ? 'Informe o nome.' : undefined;
  const emailError = !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Informe um e-mail válido.' : undefined;

  const reset = () => {
    setName('');
    setEmail('');
    setRole('agent');
    setGroupId('');
    setTouched(false);
  };

  const submit = async () => {
    setTouched(true);
    if (nameError || emailError) return;
    setSaving(true);
    try {
      await membersApi.createMember({ name, email, role, groupId: groupId || undefined });
      toast.success('Membro criado. O convite foi enviado por e-mail.');
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar o membro.');
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

export default function Members() {
  const members = useAsync(() => membersApi.listMembers());
  const licenses = useAsync(() => membersApi.getLicenses());
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [creating, setCreating] = useState(false);

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
      cell: (m) => (m.lastSeenAt ? relativeTime(m.lastSeenAt) : <span className="text-fg-muted">Convite pendente</span>),
    },
  ];

  const rowActions = (m: Member): MenuItemSpec[] => [
    { id: 'suspend', label: m.suspended ? 'Reativar' : 'Suspender', onSelect: () => void toggleSuspend(m) },
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
            <p className="mt-1 text-md">
              <span className="font-semibold">Agentes</span> {licenses.data.used} de {licenses.data.total}
            </p>
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
      <CreateMemberModal open={creating} onOpenChange={setCreating} onCreated={reloadAll} />
    </>
  );
}
