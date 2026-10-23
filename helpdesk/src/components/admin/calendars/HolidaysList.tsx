import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '@/api/calendars';
import { useAsync } from '@/components/admin/lists/useAsync';
import { Button, ConfirmModal, Pill, Select, Table, type ColumnDef, type MenuItemSpec } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { errMessage } from '@/lib/apiError';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { BusinessCalendar, Holiday, HolidayInput } from '@/types/admin-a';
import { formatCivilDate, weekdayOf } from './calendarUtils';
import { HolidayDrawer } from './HolidayDrawer';

/** Aba "Feriados": os feriados de UM calendário por vez. */
export function HolidaysList({ data, loading, error, reload, setData }: ReturnType<typeof useAsync<BusinessCalendar[]>>) {
  const canWrite = useCan(SETTINGS_WRITE);
  const [params, setParams] = useSearchParams();
  const calendars = data ?? [];
  const selected = calendars.find((c) => c.id === params.get('calendario')) ?? calendars.find((c) => c.isDefault) ?? calendars[0];
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);
  const rows = useMemo(() => selected?.holidays ?? [], [selected]);

  const replaceHolidays = (calendarId: string, fn: (list: Holiday[]) => Holiday[]) =>
    setData((prev) => (prev ?? []).map((c) => (c.id === calendarId ? { ...c, holidays: fn(c.holidays).sort((a, b) => a.date.localeCompare(b.date)) } : c)));

  const save = async (input: HolidayInput) => {
    const saved = await api.saveHoliday(input);
    replaceHolidays(input.calendarId, (list) => (list.some((h) => h.id === saved.id) ? list.map((h) => (h.id === saved.id ? saved : h)) : [...list, saved]));
    toast.success(input.id ? 'Feriado atualizado' : 'Feriado criado');
  };

  const columns: ColumnDef<Holiday>[] = [
    {
      id: 'date',
      header: 'Data',
      label: 'Data',
      width: 170,
      cell: (h) => (
        <button type="button" onClick={() => setEditing(h)} className="rounded-xs text-left text-action outline-none hover:text-action-hover hover:underline focus-visible:shadow-focus">
          {formatCivilDate(h.date)} <span className="text-fg-muted">({weekdayOf(h.date)})</span>
        </button>
      ),
    },
    { id: 'name', header: 'Nome', label: 'Nome', width: 300, cell: (h) => h.name },
    { id: 'kind', header: 'Atendimento', label: 'Atendimento', width: 220, cell: (h) => (h.start && h.end ? `Meio período, ${h.start}–${h.end}` : 'Fechado o dia todo') },
    { id: 'recurring', header: 'Repete', label: 'Repete', width: 200, cell: (h) => (h.recurring ? <Pill>Todo ano (neste navegador)</Pill> : 'Não') },
  ];

  const rowActions = (h: Holiday): MenuItemSpec[] =>
    canWrite
      ? [
          { id: 'edit', label: 'Editar', onSelect: () => setEditing(h) },
          { id: 'delete', label: 'Excluir', tone: 'danger' as const, onSelect: () => setToDelete(h) },
        ]
      : [{ id: 'view', label: 'Ver feriado', onSelect: () => setEditing(h) }];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Select
          aria-label="Calendário"
          value={selected?.id}
          placeholder="Calendário"
          onValueChange={(id) => setParams({ calendario: id }, { replace: true })}
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          className="w-64"
        />
        <div className="ml-auto">
          {canWrite && selected ? (
            <Button variant="ink" onClick={() => setEditing('new')}>
              Novo feriado
            </Button>
          ) : null}
        </div>
      </div>
      <div className="px-6 pb-6">
        <Table<Holiday>
          id="admin-holidays"
          aria-label="Feriados"
          columns={columns}
          rows={rows}
          getRowId={(h) => h.id}
          getRowLabel={(h) => h.name}
          loading={loading}
          error={error ? { message: error, onRetry: reload } : undefined}
          rowActions={rowActions}
          empty={{ title: 'Nenhum feriado neste calendário', description: canWrite ? 'Cadastre os feriados em que o atendimento fecha ou funciona em meio período.' : undefined }}
        />
      </div>
      {selected ? (
        <HolidayDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} holiday={editing === 'new' ? null : editing} calendarId={selected.id} calendarName={selected.name} readOnly={!canWrite} onSave={save} />
      ) : null}
      <ConfirmModal
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir feriado"
        description={toDelete ? `Excluir "${toDelete.name}" (${formatCivilDate(toDelete.date)})? Nesse dia o atendimento volta ao expediente normal da semana.` : undefined}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete || !selected) return;
          const id = toDelete.id;
          try {
            await api.deleteHoliday(id);
            replaceHolidays(selected.id, (list) => list.filter((h) => h.id !== id));
            toast.success('Feriado excluído');
          } catch (e) {
            toast.error(errMessage(e, 'Não foi possível excluir. Tente novamente.'));
            throw e;
          }
        }}
      />
    </>
  );
}
