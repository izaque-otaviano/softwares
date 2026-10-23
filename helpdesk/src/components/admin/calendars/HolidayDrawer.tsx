import { useState } from 'react';
import { Banner, Button, Drawer, Field, Input, Select, Switch } from '@/components/ui';
import { LocalOnlyNotice, saveErrorMessage, serverFieldError } from '@/components/admin/sla/adminAForm';
import type { Holiday, HolidayInput } from '@/types/admin-a';
import { isTime, toMinutes } from './calendarUtils';

type Kind = 'closed' | 'partial';

interface Errors {
  date?: string;
  name?: string;
  start?: string;
  end?: string;
}

export function validateHoliday(v: { date: string; name: string }, kind: Kind, start: string, end: string): Errors {
  const e: Errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(Date.parse(v.date))) e.date = 'Informe uma data válida.';
  if (!v.name.trim()) e.name = 'Informe o nome do feriado.';
  else if (v.name.trim().length > 120) e.name = 'Use no máximo 120 caracteres.';
  if (kind === 'partial') {
    if (!isTime(start)) e.start = 'Informe o horário de abertura.';
    if (!isTime(end)) e.end = 'Informe o horário de fechamento.';
    else if (isTime(start) && toMinutes(end) <= toMinutes(start)) e.end = 'O fim precisa ser depois do início.';
  }
  return e;
}

export interface HolidayDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: Holiday | null;
  calendarId: string;
  calendarName: string;
  readOnly: boolean;
  onSave: (input: HolidayInput) => Promise<void>;
}

export function HolidayDrawer(props: HolidayDrawerProps) {
  const { open, onOpenChange, holiday, readOnly } = props;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={holiday ? (readOnly ? 'Feriado' : 'Editar feriado') : 'Novo feriado'} description={`Calendário: ${props.calendarName}`} width="w-[420px]" bodyClassName="p-0">
      {open ? <HolidayForm {...props} /> : null}
    </Drawer>
  );
}

function HolidayForm({ onOpenChange, holiday, calendarId, readOnly, onSave }: HolidayDrawerProps) {
  const [date, setDate] = useState(holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [kind, setKind] = useState<Kind>(holiday?.start ? 'partial' : 'closed');
  const [start, setStart] = useState(holiday?.start ?? '09:00');
  const [end, setEnd] = useState(holiday?.end ?? '12:00');
  const [recurring, setRecurring] = useState(holiday?.recurring ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const found = validateHoliday({ date, name }, kind, start, end);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSave({ id: holiday?.id, calendarId, date, name, start: kind === 'partial' ? start : null, end: kind === 'partial' ? end : null, recurring });
      onOpenChange(false);
    } catch (e) {
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  const hasField = ['date', 'name', 'end_time', 'non_field_errors'].some((k) => serverFieldError(serverError, k));
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {serverError && !hasField ? (
          <Banner tone="error" title="Não foi possível salvar">
            {saveErrorMessage(serverError)}
          </Banner>
        ) : null}
        {serverError && serverFieldError(serverError, 'non_field_errors') ? (
          <Banner tone="error" title="Não foi possível salvar">
            {serverFieldError(serverError, 'non_field_errors')}
          </Banner>
        ) : null}
        <Field label="Data" required error={errors.date ?? serverFieldError(serverError, 'date')}>
          <Input type="date" value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </Field>
        <Field label="Nome" required error={errors.name ?? serverFieldError(serverError, 'name')}>
          <Input value={name} maxLength={120} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Atendimento neste dia">
          <Select
            value={kind}
            disabled={readOnly}
            onValueChange={(k) => setKind(k as Kind)}
            options={[
              { value: 'closed', label: 'Fechado o dia todo' },
              { value: 'partial', label: 'Meio período (só neste horário)' },
            ]}
          />
        </Field>
        {kind === 'partial' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Abre às" required error={errors.start}>
              <Input type="time" value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fecha às" required error={errors.end ?? serverFieldError(serverError, 'end_time')}>
              <Input type="time" value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        ) : null}
        <div className="space-y-2">
          <Switch checked={recurring} disabled={readOnly} onCheckedChange={setRecurring} label="Repete todo ano" />
          {recurring ? <LocalOnlyNotice>A repetição anual não é aplicada ao cálculo de prazos: cadastre a data de cada ano.</LocalOnlyNotice> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line px-4 py-3">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {readOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button type="submit" variant="primary" loading={saving}>
            Salvar
          </Button>
        )}
      </div>
    </form>
  );
}
