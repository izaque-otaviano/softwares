import { differenceInCalendarDays, format, subDays } from 'date-fns';

export type PeriodPreset = 'today' | '7d' | '30d' | 'custom';

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  custom: 'Personalizado',
};

/** Teto do intervalo livre no backend (`/reports/indicators/`). */
export const MAX_RANGE_DAYS = 366;

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Intervalo (AAAA-MM-DD, inclusive) de um atalho. "7 dias" = hoje e os 6 dias anteriores. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, now: Date = new Date()): { from: string; to: string } {
  const days = preset === 'today' ? 0 : preset === '7d' ? 6 : 29;
  return { from: iso(subDays(now, days)), to: iso(now) };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mensagem de erro de um intervalo inválido; `undefined` quando está tudo certo. */
export function rangeError(from: string, to: string): string | undefined {
  if (!ISO_RE.test(from) || !ISO_RE.test(to)) return 'Informe as duas datas do período.';
  if (from > to) return 'A data inicial vem depois da final. Troque uma delas.';
  const span = differenceInCalendarDays(new Date(`${to}T12:00:00`), new Date(`${from}T12:00:00`)) + 1;
  if (span > MAX_RANGE_DAYS) return `Escolha um período de até ${MAX_RANGE_DAYS} dias (você escolheu ${span}).`;
  return undefined;
}

/** "23/10/2026" a partir de AAAA-MM-DD. */
export const brDate = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const brDay = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function rangeLabel(from: string, to: string): string {
  return from === to ? brDate(from) : `${brDate(from)} a ${brDate(to)}`;
}
