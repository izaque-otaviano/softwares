import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { NUMBER_HINT, TEXTAREA_MAX, TEXT_MAX, formatFieldValue, formForTicket, isFilled, parseNumberInput, slotsFor, type FieldSlot } from '@/lib/customFields';
import { useRefData } from '@/store/useRefData';
import type { FieldValue } from '@/types/domain';
import { useFormEntry, useFormStore } from './formStore';

/** Id do controle do campo no painel: o atalho "Ir ao campo" do diálogo de obrigatórios o encontra por ele. */
export const fieldControlId = (ticketKey: string, slug: string): string => `cf-${ticketKey}-${slug}`;

const NONE = '';

function NumberControl({ id, value, disabled, invalid, onChange, onLocalError }: { id: string; value: FieldValue | undefined; disabled: boolean; invalid: boolean; onChange: (v: number | null) => void; onLocalError: (m: string | undefined) => void }) {
  const [text, setText] = useState(typeof value === 'number' ? String(value).replace('.', ',') : '');
  // O valor mudou por fora (troca de ticket, servidor, descartar): o texto acompanha, sem atropelar o que está sendo digitado.
  useEffect(() => {
    setText((t) => {
      const parsed = parseNumberInput(t);
      const current = typeof value === 'number' ? value : null;
      return parsed === current ? t : current === null ? '' : String(current).replace('.', ',');
    });
  }, [value]);
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      invalid={invalid}
      placeholder="0,00"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const parsed = parseNumberInput(t);
        if (parsed === undefined) {
          onLocalError(`Informe um número. ${NUMBER_HINT}`);
          return;
        }
        onLocalError(undefined);
        onChange(parsed);
      }}
    />
  );
}

/** Um campo personalizado do formulário, com o controle do seu tipo. Obrigatório = asterisco; o `400` do servidor aparece no campo. */
function CustomFieldControl({ ticketKey, slot, disabled }: { ticketKey: string; slot: FieldSlot; disabled: boolean }) {
  const entry = useFormEntry(ticketKey)!;
  const { field, required, readOnly } = slot;
  const slug = field.slug ?? field.id;
  const id = fieldControlId(ticketKey, slug);
  const value = entry.values.fieldValues[slug];
  const [localError, setLocalError] = useState<string | undefined>();
  const error = localError ?? entry.fieldErrors[slug];
  const set = (v: FieldValue | null) => useFormStore.getState().setFieldValue(ticketKey, slug, v);
  const label = readOnly ? `${field.title} (desativado)` : field.title;

  if (readOnly) {
    return (
      <div>
        <div className="mb-1 text-xs font-semibold text-fg">{label}</div>
        <div id={id} tabIndex={-1} className="min-h-8 whitespace-pre-wrap break-words rounded bg-surface-2 px-2 py-1.5 text-sm text-fg" data-readonly-field>
          {formatFieldValue(field, value)}
        </div>
        <p className="mt-1 text-xs text-fg-muted">Este campo foi desativado: o valor continua no ticket, mas não pode ser editado.</p>
      </div>
    );
  }

  const hint = field.description || undefined;
  switch (field.type) {
    case 'textarea':
      return (
        <Field label={label} required={required} error={error} hint={hint}>
          <Textarea id={id} value={typeof value === 'string' ? value : ''} minRows={3} maxLength={TEXTAREA_MAX} disabled={disabled} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case 'number':
      return (
        <Field label={label} required={required} error={error} hint={hint}>
          <NumberControl id={id} value={value} disabled={disabled} invalid={Boolean(error)} onChange={set} onLocalError={setLocalError} />
        </Field>
      );
    case 'date':
      return (
        <Field label={label} required={required} error={error} hint={hint}>
          <Input id={id} type="date" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(e) => set(e.target.value || null)} />
        </Field>
      );
    case 'checkbox':
      // Sem `Field`: o Checkbox não tem `invalid` e `false` é um valor (conta como preenchido), então o rótulo e o erro são próprios.
      return (
        <div>
          <div id={`${id}-label`} className="mb-1 text-xs font-semibold text-fg">
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            ) : null}
          </div>
          <Checkbox
            id={id}
            aria-labelledby={`${id}-label`}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            checked={value === true}
            disabled={disabled}
            label={value === undefined ? 'Marcar' : value ? 'Sim' : 'Não'}
            onCheckedChange={(c) => set(c)}
            className="w-full"
          />
          {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
          <div aria-live="polite">
            {error ? (
              <p id={`${id}-error`} className="mt-1 text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      );
    case 'dropdown': {
      const options = field.options ?? [];
      const known = typeof value === 'string' && !options.some((o) => o.value === value);
      const list = [{ value: NONE, label: '—' }, ...options.map((o) => ({ value: o.value, label: o.label })), ...(known ? [{ value: value as string, label: `${value} (removida)` }] : [])];
      return (
        <Field label={label} required={required} error={error} hint={hint}>
          <Select id={id} value={typeof value === 'string' ? value : NONE} options={list} disabled={disabled} onValueChange={(v) => set(v || null)} />
        </Field>
      );
    }
    default:
      return (
        <Field label={label} required={required} error={error} hint={hint}>
          <Input id={id} value={typeof value === 'string' ? value : ''} maxLength={TEXT_MAX} disabled={disabled} onChange={(e) => set(e.target.value)} />
        </Field>
      );
  }
}

/** Limpar o checkbox (voltar a "sem valor") fica ao lado: `false` conta como preenchido, então precisa de uma saída. */
function ClearCheckbox({ ticketKey, slot }: { ticketKey: string; slot: FieldSlot }) {
  const slug = slot.field.slug ?? slot.field.id;
  const value = useFormEntry(ticketKey)?.values.fieldValues[slug];
  if (slot.field.type !== 'checkbox' || slot.readOnly || !isFilled(value)) return null;
  return (
    <Button size="md" variant="ghost" className="-mt-2" onClick={() => useFormStore.getState().setFieldValue(ticketKey, slug, null)}>
      Limpar {slot.field.title}
    </Button>
  );
}

/** O ticket tem formulário a escolher ou campos a mostrar? (O grupo do painel só existe quando sim.) */
export function useHasCustomFields(ticketKey: string): boolean {
  const entry = useFormEntry(ticketKey);
  const fields = useRefData((s) => s.fields);
  const forms = useRefData((s) => s.forms);
  useEffect(() => {
    void useRefData.getState().ensureCustom();
  }, []);
  if (!entry) return false;
  const form = formForTicket(entry.values.formId, forms);
  return forms.filter((f) => f.active).length > 1 || slotsFor(form, fields, entry.values.fieldValues).length > 0;
}

/** Formulário do ticket (troca quando há mais de um ativo) e os campos dele, na ordem, para a equipe. */
export function CustomFieldsSection({ ticketKey, disabled }: { ticketKey: string; disabled: boolean }) {
  const entry = useFormEntry(ticketKey);
  const fields = useRefData((s) => s.fields);
  const forms = useRefData((s) => s.forms);
  useEffect(() => {
    void useRefData.getState().ensureCustom();
  }, []);
  const formId = entry?.values.formId ?? '';
  const values = entry?.values.fieldValues;
  const form = useMemo(() => formForTicket(formId, forms), [formId, forms]);
  const slots = useMemo(() => slotsFor(form, fields, values), [form, fields, values]);
  if (!entry) return null;

  const activeForms = forms.filter((f) => f.active || f.id === form?.id);
  const canSwitch = forms.filter((f) => f.active).length > 1;
  if (!canSwitch && slots.length === 0) return null;

  return (
    <section aria-label="Campos do formulário" className="space-y-3">
      {canSwitch ? (
        <Field label="Formulário" hint={entry.isNew ? 'Define os campos pedidos, a equipe e o tipo padrão.' : undefined}>
          <Select
            id={`cf-${ticketKey}-form`}
            value={form?.id ?? NONE}
            disabled={disabled}
            options={activeForms.map((f) => ({ value: f.id, label: f.isDefault ? `${f.name} (padrão)` : f.active ? f.name : `${f.name} (desativado)` }))}
            onValueChange={(v) => useFormStore.getState().selectForm(ticketKey, v)}
          />
        </Field>
      ) : null}
      {slots.map((slot) => (
        <div key={slot.field.id} className="space-y-1">
          <CustomFieldControl ticketKey={ticketKey} slot={slot} disabled={disabled} />
          <ClearCheckbox ticketKey={ticketKey} slot={slot} />
        </div>
      ))}
    </section>
  );
}
