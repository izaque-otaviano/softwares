import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { Banner, Button, Field, Input, Select, Switch } from '@/components/ui';
import { saveErrorMessage, serverFieldError } from '@/components/admin/sla/adminAForm';
import type { BackupSchedule, BackupScheduleInput } from '@/types/admin-a';
import { WEEKDAY_CRON } from './backupText';

export interface ScheduleFormProps {
  schedule: BackupSchedule;
  readOnly: boolean;
  onSave: (input: BackupScheduleInput) => Promise<void>;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Agendamento do backup: liga/desliga, frequência (diária ou semanal), horário e dia da semana. A retenção vem do servidor. */
export function ScheduleForm({ schedule, readOnly, onSave }: ScheduleFormProps) {
  const [v, setV] = useState<BackupScheduleInput>({ enabled: schedule.enabled, frequency: schedule.frequency, time: schedule.time, weekday: schedule.weekday });
  const [timeError, setTimeError] = useState<string>();
  const [dayError, setDayError] = useState<string>();
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  // Se o servidor devolver outro estado (depois de salvar), o formulário acompanha.
  useEffect(() => {
    setV({ enabled: schedule.enabled, frequency: schedule.frequency, time: schedule.time, weekday: schedule.weekday });
  }, [schedule]);

  const submit = async () => {
    const te = TIME_RE.test(v.time) ? undefined : 'Informe a hora no formato HH:MM.';
    const de = v.frequency === 'semanal' && v.weekday === null ? 'Escolha o dia da semana.' : undefined;
    setTimeError(te);
    setDayError(de);
    setServerError(null);
    if (te || de) return;
    setSaving(true);
    try {
      await onSave(v);
    } catch (e) {
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="max-w-xl space-y-4"
    >
      {serverError ? (
        <Banner tone="error" title="Não foi possível salvar o agendamento">
          {saveErrorMessage(serverError)}
        </Banner>
      ) : null}
      <Switch checked={v.enabled} disabled={readOnly} onCheckedChange={(enabled) => setV({ ...v, enabled })} label="Backup automático ligado" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Frequência">
          <Select
            value={v.frequency}
            disabled={readOnly}
            onValueChange={(f) => setV({ ...v, frequency: f as BackupScheduleInput['frequency'], weekday: f === 'semanal' ? (v.weekday ?? 0) : null })}
            options={[
              { value: 'diaria', label: 'Todos os dias' },
              { value: 'semanal', label: 'Uma vez por semana' },
            ]}
          />
        </Field>
        <Field label="Horário" required error={timeError ?? serverFieldError(serverError, 'hora')} hint="No fuso do servidor.">
          <Input type="time" value={v.time} disabled={readOnly} onChange={(e) => setV({ ...v, time: e.target.value })} className="w-36" />
        </Field>
      </div>
      {v.frequency === 'semanal' ? (
        <Field label="Dia da semana" required error={dayError ?? serverFieldError(serverError, 'dia_da_semana')}>
          <Select
            value={v.weekday === null ? undefined : String(v.weekday)}
            placeholder="Escolha o dia"
            disabled={readOnly}
            onValueChange={(d) => setV({ ...v, weekday: Number(d) })}
            options={WEEKDAY_CRON.map((label, i) => ({ value: String(i), label }))}
            className="w-56"
          />
        </Field>
      ) : null}
      <Field label="Retenção" hint="Definida no servidor (configuração do sistema): backups mais antigos que isto são apagados na rotação.">
        <Input value={`${schedule.retentionDays} dias`} readOnly aria-readonly="true" className="w-36" />
      </Field>
      <p className="text-sm text-fg-muted">
        {schedule.enabled && schedule.nextAt ? `Próxima execução prevista: ${format(new Date(schedule.nextAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.` : 'Sem execução agendada.'}
      </p>
      <Banner tone="warning">Em produção, o servidor pode ter também o timer do sistema (todo dia às 23h). Com os dois ligados saem dois backups por dia.</Banner>
      {readOnly ? null : (
        <Button type="submit" variant="primary" loading={saving}>
          Salvar agendamento
        </Button>
      )}
    </form>
  );
}
