import { useMemo } from 'react';
import { openOrg, openUser } from '@/components/shell/openTab';
import { Avatar, Pill, Table, type ColumnDef, type TableErrorConfig } from '@/components/ui';
import type { Org, User } from '@/types/domain';

const tags = (list: string[]) =>
  list.length ? (
    <span className="flex gap-1 overflow-hidden">
      {list.slice(0, 3).map((t) => (
        <Pill key={t}>{t}</Pill>
      ))}
    </span>
  ) : (
    '-'
  );

interface Common {
  loading?: boolean;
  error?: TableErrorConfig;
}

export function UsersResultTable({ rows, orgs, loading, error }: Common & { rows: User[]; orgs: Org[] }) {
  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: 'name',
        header: 'Nome',
        label: 'Nome',
        width: 240,
        cell: (u) => (
          <span className="flex items-center gap-2">
            <Avatar name={u.name} size={20} decorative />
            <span className="truncate">{u.name}</span>
          </span>
        ),
      },
      { id: 'email', header: 'E-mail', label: 'E-mail', width: 260, cell: (u) => u.email },
      { id: 'org', header: 'Organização', label: 'Organização', width: 200, cell: (u) => (u.orgId ? (orgName.get(u.orgId) ?? '-') : '-') },
      { id: 'tags', header: 'Tags', label: 'Tags', width: 200, cell: (u) => tags(u.tags) },
    ],
    [orgName],
  );
  return (
    <Table<User>
      id="search-users"
      aria-label="Usuários encontrados"
      columns={columns}
      rows={rows}
      getRowId={(u) => u.id}
      loading={loading}
      error={error}
      empty={{ illustration: 'search', title: 'Nenhum usuário encontrado' }}
      onRowClick={(u) => openUser(u.id, u.name)}
      stickyHeader
      className="h-full"
    />
  );
}

export function OrgsResultTable({ rows, loading, error }: Common & { rows: Org[] }) {
  const columns = useMemo<ColumnDef<Org>[]>(
    () => [
      { id: 'name', header: 'Nome', label: 'Nome', width: 260, cell: (o) => o.name },
      { id: 'domains', header: 'Domínio', label: 'Domínio', width: 240, cell: (o) => o.domains.join(', ') || '-' },
      { id: 'tags', header: 'Tags', label: 'Tags', width: 200, cell: (o) => tags(o.tags) },
    ],
    [],
  );
  return (
    <Table<Org>
      id="search-orgs"
      aria-label="Organizações encontradas"
      columns={columns}
      rows={rows}
      getRowId={(o) => o.id}
      loading={loading}
      error={error}
      empty={{ illustration: 'search', title: 'Nenhuma organização encontrada' }}
      onRowClick={(o) => openOrg(o.id, o.name)}
      stickyHeader
      className="h-full"
    />
  );
}

