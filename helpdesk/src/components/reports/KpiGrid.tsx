import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { fmtVariation } from './format';

export interface KpiItem {
  key: string;
  label: string;
  /** Texto principal; "—" quando não há dado. */
  value: string;
  hint?: ReactNode;
  /** Variação percentual sobre o período anterior (só se o backend informar). */
  variation?: number | null;
  /** `true`: o número não existe com os filtros atuais (explicado em `hint`). */
  unavailable?: boolean;
}

function Variation({ v }: { v: number }) {
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus;
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-fg-muted">
      <Icon aria-hidden className="h-3.5 w-3.5" />
      <span>{fmtVariation(v)} em relação ao período anterior</span>
    </span>
  );
}

/** Cartões de indicadores: lista de definição (termo = nome do indicador, descrição = valor). */
export function KpiGrid({ items, label }: { items: KpiItem[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((k) => (
        <div key={k.key} className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-4">
          <dt className="text-xs font-semibold text-fg-muted">{k.label}</dt>
          <dd className={`mt-1 text-2xl ${k.unavailable ? 'text-fg-muted' : 'text-fg'}`}>{k.value}</dd>
          {k.hint ? <dd className="mt-0.5 text-xs text-fg-muted">{k.hint}</dd> : null}
          {k.variation !== null && k.variation !== undefined ? <dd><Variation v={k.variation} /></dd> : null}
        </div>
      ))}
    </dl>
  );
}
