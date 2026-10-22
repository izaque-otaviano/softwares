import { membersApi } from '@/api';
import type { GroupRow } from '@/api/members';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/useAsync';
import { Table, type ColumnDef } from '@/components/ui';

const COLUMNS: ColumnDef<GroupRow>[] = [
  { id: 'name', header: 'Grupo', label: 'Grupo', width: 220, cell: (g) => <span className="font-semibold">{g.name}</span> },
  { id: 'members', header: 'Agentes', label: 'Agentes', width: 120, cell: (g) => g.members },
  { id: 'names', header: 'Membros', label: 'Membros', width: 460, cell: (g) => g.memberNames.join(', ') || '—' },
];

export default function Groups() {
  const { data, loading, error, reload } = useAsync(() => membersApi.listGroupRows());
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Pessoas' }, { label: 'Grupos' }]} title="Grupos" description="Grupos organizam os agentes e recebem tickets por regras de atribuição." />
      <AdminBody>
        <Table
          id="admin-groups"
          aria-label="Grupos"
          columns={COLUMNS}
          rows={data ?? []}
          getRowId={(g) => g.id}
          loading={loading && !data}
          error={error && !data ? { message: error, onRetry: reload } : undefined}
          empty={{ title: 'Nenhum grupo encontrado' }}
        />
      </AdminBody>
    </>
  );
}
