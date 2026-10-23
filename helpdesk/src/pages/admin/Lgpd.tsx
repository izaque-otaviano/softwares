import { useMemo, useState } from 'react';
import { listRequests } from '@/api/lgpd';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { AUDIT_ACCESS, NO_PERMISSION_MESSAGE } from '@/components/admin/audit/adminAccess';
import { dateTime } from '@/components/admin/audit/format';
import { Pager } from '@/components/admin/audit/Pager';
import { usePaged } from '@/components/admin/audit/usePaged';
import { deadlineText, KIND_LABEL, requestIdentifier, STATUS_LABEL, STATUS_TONE, subjectName } from '@/components/admin/lgpd/dsrText';
import { NewRequestModal } from '@/components/admin/lgpd/NewRequestModal';
import { RequestDrawer } from '@/components/admin/lgpd/RequestDrawer';
import { Banner, Button, Field, Pill, Select, Table, type ColumnDef } from '@/components/ui';
import { useCan } from '@/lib/permissions';
import type { DataSubjectRequest } from '@/types/admin-b';

const PAGE = 25;
const STATUS_FILTER = [{ value: '', label: 'Todos os estados' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))];

/** Fila de pedidos de titulares (LGPD). Execução e redação são irreversíveis e pedem confirmação forte. */
export default function AdminLgpd() {
  const canRead = useCan(AUDIT_ACCESS);
  const { page, loading, error, offset, setOffset, reload } = usePaged((o) => listRequests({ limit: PAGE, offset: o }), 'lgpd', canRead);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<DataSubjectRequest | null>(null);
  const [creating, setCreating] = useState(false);
  const [patched, setPatched] = useState<Record<string, DataSubjectRequest>>({});

  const rows = useMemo(() => (page?.items ?? []).map((r) => patched[r.id] ?? r).filter((r) => !status || r.status === status), [page, patched, status]);

  const columns: ColumnDef<DataSubjectRequest>[] = [
    { id: 'id', header: 'Pedido', label: 'Pedido', width: 110, cell: (r) => requestIdentifier(r) },
    { id: 'kind', header: 'Tipo', label: 'Tipo', width: 170, cell: (r) => KIND_LABEL[r.kind] },
    { id: 'subject', header: 'Titular', label: 'Titular', width: 220, cell: (r) => subjectName(r) },
    { id: 'status', header: 'Estado', label: 'Estado', width: 190, cell: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill> },
    { id: 'deadline', header: 'Prazo restante', label: 'Prazo restante', width: 170, cell: (r) => (r.isOverdue ? <Pill tone="danger">{deadlineText(r)}</Pill> : deadlineText(r)) },
    { id: 'createdAt', header: 'Aberto em', label: 'Aberto em', width: 150, cell: (r) => dateTime(r.createdAt) },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'LGPD' }]}
        title="LGPD"
        description="Pedidos de titulares de dados. O prazo legal é de 15 dias. Anonimizar não tem volta."
        actions={
          canRead ? (
            <Button variant="ink" onClick={() => setCreating(true)}>
              Novo pedido
            </Button>
          ) : undefined
        }
      />
      <AdminBody>
        {!canRead ? (
          <Banner tone="info">{NO_PERMISSION_MESSAGE} Os pedidos de LGPD são exclusivos de administradores.</Banner>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="Estado (nesta página)">
                <Select aria-label="Filtrar por estado" value={status} onValueChange={setStatus} options={STATUS_FILTER} className="w-56" />
              </Field>
            </div>
            <Table<DataSubjectRequest>
              id="admin-lgpd"
              aria-label="Pedidos de titulares"
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              getRowLabel={(r) => `${requestIdentifier(r)}, ${KIND_LABEL[r.kind]}`}
              loading={loading && !page}
              error={error && !page ? { message: error, onRetry: reload } : undefined}
              onRowClick={setOpen}
              empty={{ title: 'Nenhum pedido', description: status ? 'Nenhum pedido com este estado nesta página.' : 'Quando um titular pedir seus dados, o pedido aparece aqui.' }}
            />
            {page ? <Pager total={page.total} limit={page.limit} offset={offset} onOffset={setOffset} loading={loading} label="Paginação dos pedidos" /> : null}
          </>
        )}
      </AdminBody>
      <NewRequestModal
        open={creating}
        onOpenChange={setCreating}
        onCreated={(r) => {
          setOffset(0);
          reload();
          setOpen(r);
        }}
      />
      <RequestDrawer
        request={open ? (patched[open.id] ?? open) : null}
        onClose={() => setOpen(null)}
        onChanged={(r) => {
          setPatched((p) => ({ ...p, [r.id]: r }));
          reload();
        }}
      />
    </>
  );
}
