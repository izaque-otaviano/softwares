import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '@/api/calendars';
import { EditFooter, PageHeader } from '@/components/admin/PageHeader';
import { useAsync } from '@/components/admin/lists/useAsync';
import { ReadOnlyNotice, saveErrorMessage, serverFieldError } from '@/components/admin/sla/adminAForm';
import { Banner, EmptyState, Field, Input, Select, Skeleton, Switch } from '@/components/ui';
import { SETTINGS_WRITE } from '@/lib/adminAPermissions';
import { useCan } from '@/lib/permissions';
import { toast } from '@/store/useUi';
import type { CalendarInput } from '@/types/admin-a';
import { timezoneOptions, validateWindows } from './calendarUtils';
import { WeekEditor } from './WeekEditor';

const BACK = '/admin/calendarios';
const blank = (): CalendarInput => ({ name: '', timezone: 'America/Sao_Paulo', isDefault: false, windows: [0, 1, 2, 3, 4].flatMap((weekday) => [{ weekday, start: '09:00', end: '18:00' }]) });

/** Edição de um calendário (`/admin/calendarios/novo` e `/admin/calendarios/:id`). */
export default function CalendarEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'novo';
  const navigate = useNavigate();
  const canWrite = useCan(SETTINGS_WRITE);
  const { data, loading, error, reload } = useAsync(() => api.listCalendars());
  const [v, setV] = useState<CalendarInput | null>(isNew ? blank() : null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<unknown>(null);

  const found = isNew ? undefined : data?.find((c) => c.id === id);
  useEffect(() => {
    if (found && v === null) setV({ id: found.id, name: found.name, timezone: found.timezone, isDefault: found.isDefault, windows: found.windows });
  }, [found, v]);

  const title = isNew ? 'Novo calendário' : (found?.name ?? 'Calendário');
  const header = <PageHeader breadcrumb={[{ label: 'Administração', to: '/admin' }, { label: 'Calendários e feriados', to: BACK }, { label: title }]} title={title} description="Horário de atendimento usado no cálculo de SLA e nas regras de chat fora do expediente." />;

  if (!isNew && loading) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        {header}
        <div className="px-6 py-4">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  if (!isNew && (error || !found)) {
    return (
      <div className="flex min-h-full flex-col bg-surface">
        {header}
        <div className="px-6 py-4">
          {error ? (
            <Banner tone="error" onRetry={reload}>
              {error}
            </Banner>
          ) : (
            <EmptyState illustration="box" title="Calendário não encontrado" description="Ele pode ter sido excluído." />
          )}
        </div>
      </div>
    );
  }
  if (!v) return null;

  const nameError = !v.name.trim() ? 'Informe o nome do calendário.' : v.name.trim().length > 80 ? 'Use no máximo 80 caracteres.' : undefined;
  const winErrors = validateWindows(v.windows);
  const invalid = Boolean(nameError) || Object.keys(winErrors).length > 0;

  const save = async () => {
    setTried(true);
    setServerError(null);
    if (invalid) return;
    setSaving(true);
    try {
      await api.saveCalendar(v);
      toast.success(isNew ? 'Calendário criado' : 'Calendário atualizado');
      navigate(BACK);
    } catch (e) {
      // Fica na tela com o que foi digitado.
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-surface">
      {header}
      {canWrite ? null : <ReadOnlyNotice>Você pode consultar este calendário, mas só administradores alteram.</ReadOnlyNotice>}
      <div className="flex-1 space-y-5 px-6 py-4">
        {serverError ? (
          <Banner tone="error" title="Não foi possível salvar">
            {saveErrorMessage(serverError)}
          </Banner>
        ) : null}
        <div className="grid max-w-2xl gap-4 md:grid-cols-2">
          <Field label="Nome" required error={(tried ? nameError : undefined) ?? serverFieldError(serverError, 'name')}>
            <Input value={v.name} maxLength={80} disabled={!canWrite} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Fuso horário" required>
            <Select aria-label="Fuso horário" value={v.timezone} disabled={!canWrite} onValueChange={(timezone) => setV({ ...v, timezone })} options={timezoneOptions(v.timezone)} />
          </Field>
        </div>
        <div>
          <Switch checked={v.isDefault} disabled={!canWrite} onCheckedChange={(isDefault) => setV({ ...v, isDefault })} label="Calendário padrão" />
          <p className="mt-1 text-xs text-fg-muted">Aplicado quando a empresa não tem um calendário próprio. Só pode haver um padrão: marcar este desmarca o anterior.</p>
        </div>
        <WeekEditor windows={v.windows} onChange={(windows) => setV({ ...v, windows })} disabled={!canWrite} showErrors={tried} />
        {v.windows.length === 0 ? <Banner tone="warning">Sem nenhuma faixa, o calendário não tem expediente: o SLA em horário de atendimento nunca corre.</Banner> : null}
      </div>
      {canWrite ? <EditFooter onCancel={() => navigate(BACK)} onSave={() => void save()} saving={saving} /> : null}
    </div>
  );
}
