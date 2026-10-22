import { membersApi } from '@/api';
import type { RoleRow } from '@/api/members';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { Table, type ColumnDef } from '@/components/ui';

const COLUMNS: ColumnDef<RoleRow>[] = [
  { id: 'name', header: 'Função', label: 'Função', width: 200, cell: (r) => <span className="font-semibold">{r.name}</span> },
  { id: 'description', header: 'Descrição', label: 'Descrição', width: 460, cell: (r) => r.description },
  { id: 'members', header: 'Membros', label: 'Membros', width: 120, cell: (r) => r.members },
];

export default function Roles() {
  const { data, loading, error, reload } = useAsync(() => membersApi.listRoles());
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Pessoas' }, { label: 'Funções' }]} title="Funções" description="Funções definem o que cada pessoa da equipe pode fazer." />
      <AdminBody>
        <Table
          id="admin-roles"
          aria-label="Funções"
          columns={COLUMNS}
          rows={data ?? []}
          getRowId={(r) => r.id}
          loading={loading && !data}
          error={error && !data ? { message: error, onRetry: reload } : undefined}
          empty={{ title: 'Nenhuma função encontrada' }}
        />
      </AdminBody>
    </>
  );
}
