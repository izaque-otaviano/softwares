import { useState } from 'react';
import { Banner, Button, Drawer, Field, Input, Select, Switch } from '@/components/ui';
import type { PriorityTarget, RefOption, SlaPolicy, SlaPolicyInput } from '@/types/admin-a';
import type { Priority } from '@/types/domain';
import { DurationField, LocalOnlyNotice, saveErrorMessage, serverFieldError } from './adminAForm';

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

interface Errors {
  name?: string;
  first?: string;
  resolution?: string;
  priority?: Partial<Record<Priority, string>>;
}

const emptyInput = (): SlaPolicyInput => ({ name: '', planId: null, teamId: null, firstResponseMinutes: 480, resolutionMinutes: 1440, useBusinessHours: true, active: true, priorityTargets: {} });
const fromPolicy = (p: SlaPolicy): SlaPolicyInput => ({ id: p.id, name: p.name, planId: p.planId, teamId: p.teamId, firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes, useBusinessHours: p.useBusinessHours, active: p.active, priorityTargets: structuredClone(p.priorityTargets) });

export function validateSla(v: SlaPolicyInput): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = 'Informe o nome da política.';
  else if (v.name.trim().length > 80) e.name = 'Use no máximo 80 caracteres.';
  if (!(v.firstResponseMinutes > 0)) e.first = 'Informe um prazo maior que zero.';
  if (!(v.resolutionMinutes > 0)) e.resolution = 'Informe um prazo maior que zero.';
  else if (v.firstResponseMinutes > 0 && v.resolutionMinutes < v.firstResponseMinutes) e.resolution = 'O prazo de solução não pode ser menor que o de primeira resposta.';
  for (const [p, t] of Object.entries(v.priorityTargets) as [Priority, PriorityTarget][]) {
    if (t.firstResponseMinutes !== null && t.resolutionMinutes !== null && t.resolutionMinutes < t.firstResponseMinutes) {
      (e.priority ??= {})[p] = 'A solução não pode ser menor que a primeira resposta.';
    }
  }
  return e;
}

export interface SlaPolicyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Política em edição; `null` = nova. */
  policy: SlaPolicy | null;
  plans: RefOption[];
  teams: RefOption[];
  defaultCalendar: string | null;
  readOnly: boolean;
  onSave: (input: SlaPolicyInput) => Promise<void>;
}

export function SlaPolicyDrawer(props: SlaPolicyDrawerProps) {
  // O conteúdo só existe aberto: o estado do formulário nasce a cada abertura.
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} title={props.policy ? (props.readOnly ? 'Política de SLA' : 'Editar política de SLA') : 'Nova política de SLA'} width="w-[580px]" bodyClassName="p-0">
      {props.open ? <SlaForm {...props} /> : null}
    </Drawer>
  );
}

function SlaForm({ onOpenChange, policy, plans, teams, defaultCalendar, readOnly, onSave }: SlaPolicyDrawerProps) {
  const [v, setV] = useState<SlaPolicyInput>(() => (policy ? fromPolicy(policy) : emptyInput()));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [showPriority, setShowPriority] = useState(() => Object.keys(v.priorityTargets).length > 0);
  const set = <K extends keyof SlaPolicyInput>(k: K, val: SlaPolicyInput[K]) => setV((s) => ({ ...s, [k]: val }));

  const setTarget = (p: Priority, patch: Partial<PriorityTarget>) =>
    setV((s) => {
      const cur: PriorityTarget = s.priorityTargets[p] ?? { firstResponseMinutes: null, resolutionMinutes: null };
      const next = { ...cur, ...patch };
      const targets = { ...s.priorityTargets };
      if (next.firstResponseMinutes === null && next.resolutionMinutes === null) delete targets[p];
      else targets[p] = next;
      return { ...s, priorityTargets: targets };
    });

  const submit = async () => {
    const found = validateSla(v);
    setErrors(found);
    setServerError(null);
    if (found.name || found.first || found.resolution || found.priority) return;
    setSaving(true);
    try {
      await onSave(v);
      onOpenChange(false);
    } catch (e) {
      setServerError(e);
    } finally {
      setSaving(false);
    }
  };

  const nameError = errors.name ?? serverFieldError(serverError, 'name');
  const generalError = serverError && !serverFieldError(serverError, 'name') && !serverFieldError(serverError, 'resolution_minutes') ? saveErrorMessage(serverError) : null;

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
        {generalError ? (
          <Banner tone="error" title="Não foi possível salvar">
            {generalError}
          </Banner>
        ) : null}
        <Field label="Nome" required error={nameError}>
          <Input value={v.name} maxLength={80} disabled={readOnly} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plano" hint="Vazio vale para todos os planos.">
            <Select value={v.planId ?? ''} disabled={readOnly} onValueChange={(x) => set('planId', x || null)} options={[{ value: '', label: 'Todos os planos' }, ...plans.map((p) => ({ value: p.id, label: p.name }))]} />
          </Field>
          <Field label="Equipe" hint="Vazio vale para todas as equipes.">
            <Select value={v.teamId ?? ''} disabled={readOnly} onValueChange={(x) => set('teamId', x || null)} options={[{ value: '', label: 'Todas as equipes' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
        </div>
        <p className="text-xs text-fg-muted">A política mais específica vence: plano e equipe, depois só plano ou só equipe, depois a padrão.</p>
        <DurationField label="Meta de primeira resposta" required value={v.firstResponseMinutes} onChange={(m) => set('firstResponseMinutes', m ?? 0)} error={errors.first} disabled={readOnly} />
        <DurationField label="Meta de solução" required value={v.resolutionMinutes} onChange={(m) => set('resolutionMinutes', m ?? 0)} error={errors.resolution ?? serverFieldError(serverError, 'resolution_minutes')} disabled={readOnly} />
        <div>
          <Switch checked={v.useBusinessHours} disabled={readOnly} onCheckedChange={(c) => set('useBusinessHours', c)} label="Contar só no horário de atendimento" />
          <p className="mt-1 text-xs text-fg-muted">
            {v.useBusinessHours
              ? `Calendário aplicado: ${defaultCalendar ?? 'nenhum calendário padrão'}${defaultCalendar ? ' (o da empresa, quando ela tiver um próprio; senão o padrão)' : ''}. Fins de semana e feriados não contam.`
              : 'O prazo corre 24 horas por dia, todos os dias.'}
          </p>
        </div>
        <Switch checked={v.active} disabled={readOnly} onCheckedChange={(c) => set('active', c)} label="Política ativa" />

        <section aria-labelledby="sla-priority-title" className="rounded border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="sla-priority-title" className="text-sm font-semibold text-fg">
              Metas por prioridade
            </h3>
            <Button type="button" variant="ghost" aria-expanded={showPriority} aria-controls="sla-priority-body" onClick={() => setShowPriority((x) => !x)}>
              {showPriority ? 'Ocultar' : 'Definir'}
            </Button>
          </div>
          {showPriority ? (
            <div id="sla-priority-body" className="mt-2 space-y-3">
              <LocalOnlyNotice>Estas metas por prioridade ficam só aqui e não são aplicadas aos tickets.</LocalOnlyNotice>
              {PRIORITIES.map(({ value, label }) => (
                <fieldset key={value} className="grid grid-cols-2 gap-3 border-t border-line pt-2">
                  <legend className="px-1 text-xs font-semibold text-fg">{label}</legend>
                  <DurationField label={`${label}: primeira resposta`} value={v.priorityTargets[value]?.firstResponseMinutes ?? null} onChange={(m) => setTarget(value, { firstResponseMinutes: m })} disabled={readOnly} hint="Vazio usa a meta geral." />
                  <DurationField label={`${label}: solução`} value={v.priorityTargets[value]?.resolutionMinutes ?? null} onChange={(m) => setTarget(value, { resolutionMinutes: m })} error={errors.priority?.[value]} disabled={readOnly} hint="Vazio usa a meta geral." />
                </fieldset>
              ))}
            </div>
          ) : null}
        </section>
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
