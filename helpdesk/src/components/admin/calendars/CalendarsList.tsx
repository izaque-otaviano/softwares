import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/api/calendars';
import { useAsync } from '@/components/admin/lists/useAsync';
import { Button, ConfirmModal, Pill, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { BusinessCalendar } from '@/types/admin-a';
import { summarizeWindows } from './calendarUtils';

/** Aba "Calendários". */
export function CalendarsList({ data, loading, error, reload, setData }: ReturnType<typeof useAsync<BusinessCalendar[]>>) {
  const navigate = useNavigate();
  const canWrite = useCan(SETTINGS_WRITE);
  const [toDelete, setToDelete] = useState<BusinessCalendar | null>(null);
  const rows = useMemo(() => data ?? [], [data]);

  const columns: ColumnDef<BusinessCalendar>[] = [
    {
      id: 'name',
      header: 'Calendário',
      label: 'Calendário',
      width: 240,
      cell: (c) => (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(`/admin/calendarios/${c.id}`)} className="truncate rounded-xs text-left text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
            {c.name}
          </button>
          {c.isDefault ? <Pill tone="action">Padrão</Pill> : null}
        </span>
      ),
    },
    { id: 'tz', header: 'Fuso', label: 'Fuso', width: 200, cell: (c) => c.timezone.replace(/_/g, ' ') },
    { id: 'hours', header: 'Horário de atendimento', label: 'Horário de atendimento', width: 360, cell: (c) => summarizeWindows(c.windows) },
    { id: 'holidays', header: 'Feriados', label: 'Feriados', width: 100, align: 'right', cell: (c) => c.holidays.length },
  ];

  const rowActions = (c: BusinessCalendar): MenuItemSpec[] =>
    canWrite
      ? [
          { id: 'edit', label: 'Editar', onSelect: () => navigate(`/admin/calendarios/${c.id}`) },
          { id: 'holidays', label: 'Ver feriados', onSelect: () => navigate(`/admin/calendarios/feriados?calendario=${c.id}`) },
          { id: 'delete', label: 'Excluir', tone: 'danger' as const, onSelect: () => setToDelete(c) },
        ]
      : [{ id: 'view', label: 'Ver calendário', onSelect: () => navigate(`/admin/calendarios/${c.id}`) }];

  return (
    <>
      <div className="flex items-center justify-end px-6 py-3">
        {canWrite ? (
          <Button variant="ink" onClick={() => navigate('/admin/calendarios/novo')}>
            Novo calendário
          </Button>
        ) : null}
      </div>
      <div className="px-6 pb-6">
        <Table<BusinessCalendar>
          id="admin-calendars"
          aria-label="Calendários"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          getRowLabel={(c) => c.name}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{ title: 'Nenhum calendário', description: canWrite ? 'Crie o primeiro calendário de atendimento.' : undefined }}
        />
      </div>
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir calendário"
        description={toDelete ? `Excluir "${toDelete.name}" e seus ${toDelete.holidays.length} feriados? Empresas ou equipes que o usam impedem a exclusão. Esta ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          const id = toDelete.id;
          try {
            await api.deleteCalendar(id);
            setData((prev) => (prev ?? []).filter((c) => c.id !== id));
            toast.success('Calendário excluído');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível excluir. Tente novamente.'));
            throw e;
          }
        }}
      />
    </>
  );
}
