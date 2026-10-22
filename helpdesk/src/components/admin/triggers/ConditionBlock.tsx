import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Select } from '@/components/ui';
import type { Condition, ConditionOperator } from '@/types/domain';
import { FIELDS, NO_VALUE_OPERATORS, OPERATOR_LABEL, blankCondition, conditionForField, fieldMeta, type Lookups } from './triggerMeta';

export interface ConditionBlockProps {
  title: string;
  hint?: string;
  /** Prefixo dos nomes acessíveis ("todas" / "qualquer"). */
  scope: string;
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  lookups: Lookups;
}

/** Um bloco de condições (TODAS ou QUALQUER): linhas Categoria · Operador · Valor + lixeira. */
export function ConditionBlock({ title, hint, scope, conditions, onChange, lookups }: ConditionBlockProps) {
  const update = (i: number, patch: Partial<Condition>) => onChange(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <section aria-label={title} className="rounded border border-line bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
      <ul className="mt-3 flex flex-col gap-2">
        {conditions.map((c, i) => {
          const meta = fieldMeta(c.field);
          const options = meta?.options?.(lookups);
          const operators = meta?.operators ?? (Object.keys(OPERATOR_LABEL) as ConditionOperator[]);
          const needsValue = !NO_VALUE_OPERATORS.includes(c.operator);
          const n = i + 1;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={`Categoria da condição ${n} (${scope})`}
                className="w-64"
                value={c.field}
                onValueChange={(v) => onChange(conditions.map((x, idx) => (idx === i ? conditionForField(v, lookups) : x)))}
                options={FIELDS.map((f) => ({ value: f.id, label: f.label }))}
              />
              <Select
                aria-label={`Operador da condição ${n} (${scope})`}
                className="w-44"
                value={c.operator}
                onValueChange={(v) => update(i, { operator: v as ConditionOperator, value: NO_VALUE_OPERATORS.includes(v as ConditionOperator) ? undefined : (c.value ?? options?.[0]?.value ?? '') })}
                options={operators.map((o) => ({ value: o, label: OPERATOR_LABEL[o] }))}
              />
              {needsValue ? (
                options ? (
                  <Select
                    aria-label={`Valor da condição ${n} (${scope})`}
                    className="w-56"
                    value={c.value ?? ''}
                    onValueChange={(v) => update(i, { value: v })}
                    options={options}
                    placeholder="Selecione"
                  />
                ) : (
                  <Input aria-label={`Valor da condição ${n} (${scope})`} className="w-56" value={c.value ?? ''} onChange={(e) => update(i, { value: e.target.value })} />
                )
              ) : null}
              <IconButton label={`Remover condição ${n} (${scope})`} icon={<Trash2 />} onClick={() => onChange(conditions.filter((_, idx) => idx !== i))} />
            </li>
          );
        })}
      </ul>
      {conditions.length === 0 ? <p className="mt-2 text-sm text-fg-muted">Nenhuma condição.</p> : null}
      <Button variant="outline" className="mt-3" leadingIcon={<Plus />} onClick={() => onChange([...conditions, blankCondition()])}>
        Adicionar condição
      </Button>
    </section>
  );
}
