import { useState } from 'react';
import { Banner, Button, Drawer, Field, Input, Select, Switch, Textarea } from '@/components/ui';
import { DurationField, saveErrorMessage, serverFieldError } from '@/components/admin/sla/adminAForm';
import type { Plan, PlanInput } from '@/types/admin-a';

export const PERIOD_LABEL: Record<string, string> = { weekly: 'semana', monthly: 'mês' };

const empty = (): PlanInput => ({ slug: '', name: '', description: '', active: true, rank: 0, ticketLimit: null, limitPeriod: 'monthly', monthlyMaintenanceMinutes: null, chatEnabled: true, chatConsumesQuota: false });
const fromPlan = (p: Plan): PlanInput => ({ id: p.id, slug: p.slug, name: p.name, description: p.description, active: p.active, rank: p.rank, ticketLimit: p.ticketLimit, limitPeriod: p.limitPeriod, monthlyMaintenanceMinutes: p.monthlyMaintenanceMinutes, chatEnabled: p.chatEnabled, chatConsumesQuota: p.chatConsumesQuota });

/** "Plano Ouro 2" -> "plano-ouro-2": o identificador na URL/API nasce do nome. */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

interface Errors {
  slug?: string;
  name?: string;
  rank?: string;
  limit?: string;
  hours?: string;
}

export function validatePlan(v: PlanInput, limitText: string): Errors {
  const e: Errors = {};
  if (!v.slug?.trim()) e.slug = 'Informe o identificador (letras, números e hífen).';
  else if (!/^[-a-zA-Z0-9_]+$/.test(v.slug)) e.slug = 'Use só letras sem acento, números, hífen e sublinhado.';
  if (!v.name.trim()) e.name = 'Informe o nome do plano.';
  else if (v.name.trim().length > 50) e.name = 'Use no máximo 50 caracteres.';
  if (!Number.isInteger(v.rank) || v.rank < 0 || v.rank > 32767) e.rank = 'Use um número inteiro entre 0 e 32767.';
  if (limitText.trim() !== '' && (v.ticketLimit === null || !Number.isInteger(v.ticketLimit) || v.ticketLimit < 0)) e.limit = 'Use um número inteiro igual ou maior que zero, ou deixe vazio para ilimitado.';
  if (v.monthlyMaintenanceMinutes !== null && v.monthlyMaintenanceMinutes < 0) e.hours = 'Use um valor igual ou maior que zero.';
  return e;
}

export interface PlanDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  readOnly: boolean;
  onSave: (input: PlanInput) => Promise<void>;
}

export function PlanDrawer(props: PlanDrawerProps) {
  const { open, onOpenChange, plan, readOnly } = props;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={plan ? (readOnly ? 'Plano de atendimento' : 'Editar plano') : 'Novo plano'} width="w-[440px]" bodyClassName="p-0">
      {open ? <PlanForm {...props} /> : null}
    </Drawer>
  );
}

function PlanForm({ onOpenChange, plan, readOnly, onSave }: PlanDrawerProps) {
  const [v, setV] = useState<PlanInput>(() => (plan ? fromPlan(plan) : empty()));
  const [slugTouched, setSlugTouched] = useState(Boolean(plan));
  const [limitText, setLimitText] = useState(() => (plan?.ticketLimit === null || plan?.ticketLimit === undefined ? '' : String(plan.ticketLimit)));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PlanInput>(k: K, val: PlanInput[K]) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    const found = validatePlan(v, limitText);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSave({ ...v, chatConsumesQuota: v.chatEnabled ? v.chatConsumesQuota : false });
      onOpenChange(false);
    } catch (e) {
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  const fieldKeys = ['name', 'slug', 'rank', 'default_ticket_limit', 'monthly_maintenance_minutes'];
  const general = serverError && !fieldKeys.some((k) => serverFieldError(serverError, k)) ? saveErrorMessage(serverError) : null;

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
        {general ? (
          <Banner tone="error" title="Não foi possível salvar">
            {general}
          </Banner>
        ) : null}
        <Field label="Nome" required error={errors.name ?? serverFieldError(serverError, 'name')}>
          <Input
            value={v.name}
            maxLength={50}
            disabled={readOnly}
            onChange={(e) => {
              const name = e.target.value;
              setV((s) => ({ ...s, name, ...(slugTouched ? {} : { slug: slugify(name) }) }));
            }}
          />
        </Field>
        <Field label="Identificador" required error={errors.slug ?? serverFieldError(serverError, 'slug')} hint="Usado em links e integrações. Nasce do nome; edite só se precisar.">
          <Input
            value={v.slug ?? ''}
            maxLength={50}
            disabled={readOnly}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
          />
        </Field>
        <Field label="Descrição">
          <Textarea value={v.description} rows={3} disabled={readOnly} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Posição na escada" required error={errors.rank ?? serverFieldError(serverError, 'rank')} hint="Maior número = plano superior (Black acima de Gold).">
          <Input type="number" min={0} value={String(v.rank)} disabled={readOnly} onChange={(e) => set('rank', e.target.value === '' ? Number.NaN : Number(e.target.value))} className="w-32" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Franquia de tickets" error={errors.limit ?? serverFieldError(serverError, 'default_ticket_limit')} hint="Vazio = ilimitado.">
            <Input
              type="number"
              min={0}
              value={limitText}
              disabled={readOnly}
              onChange={(e) => {
                setLimitText(e.target.value);
                set('ticketLimit', e.target.value === '' ? null : Number(e.target.value));
              }}
            />
          </Field>
          <Field label="Por">
            <Select value={v.limitPeriod} disabled={readOnly} onValueChange={(x) => set('limitPeriod', x)} options={[{ value: 'monthly', label: 'Mês' }, { value: 'weekly', label: 'Semana' }]} />
          </Field>
        </div>
        <DurationField label="Franquia mensal de horas de manutenção" value={v.monthlyMaintenanceMinutes} onChange={(m) => set('monthlyMaintenanceMinutes', m)} error={errors.hours ?? serverFieldError(serverError, 'monthly_maintenance_minutes')} hint="Vazio = sem franquia; nada é medido para este plano." disabled={readOnly} />
        <div className="space-y-2">
          <Switch checked={v.chatEnabled} disabled={readOnly} onCheckedChange={(c) => set('chatEnabled', c)} label="Chat habilitado" />
          <div>
            <Switch checked={v.chatEnabled && v.chatConsumesQuota} disabled={readOnly || !v.chatEnabled} onCheckedChange={(c) => set('chatConsumesQuota', c)} label="Chat que vira ticket consome a franquia" />
          </div>
          <Switch checked={v.active} disabled={readOnly} onCheckedChange={(c) => set('active', c)} label="Plano ativo" />
        </div>
        {plan ? <p className="text-xs text-fg-muted">{plan.companyCount === 1 ? '1 empresa usa' : `${plan.companyCount} empresas usam`} este plano.</p> : null}
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
