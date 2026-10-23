import type { WorkWindow } from '@/types/admin-a';

/** 0 = segunda ... 6 = domingo, como no backend. */
export const WEEKDAYS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'] as const;
export const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as const;

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (v: string): boolean => TIME_RE.test(v);

/** Janelas do dia, em ordem. */
export const windowsOf = (all: WorkWindow[], weekday: number): WorkWindow[] => all.filter((w) => w.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start));

/**
 * Valida as janelas como o backend: horas válidas, fim depois do início e nenhuma sobreposição no mesmo dia.
 * Devolve a mensagem por dia da semana (só os dias com problema).
 */
export function validateWindows(all: WorkWindow[]): Record<number, string> {
  const errors: Record<number, string> = {};
  for (let d = 0; d < 7; d++) {
    const list = windowsOf(all, d);
    if (list.some((w) => !isTime(w.start) || !isTime(w.end))) {
      errors[d] = 'Preencha o início e o fim de cada faixa.';
      continue;
    }
    if (list.some((w) => toMinutes(w.end) <= toMinutes(w.start))) {
      errors[d] = 'O fim da faixa precisa ser depois do início.';
      continue;
    }
    for (let i = 1; i < list.length; i++) {
      if (toMinutes(list[i]!.start) < toMinutes(list[i - 1]!.end)) {
        errors[d] = 'As faixas do mesmo dia não podem se sobrepor.';
        break;
      }
    }
  }
  return errors;
}

/** "seg a sex, 09:00–12:00 e 13:00–18:00" (agrupa dias com as mesmas faixas). */
export function summarizeWindows(all: WorkWindow[]): string {
  if (all.length === 0) return 'Sem expediente';
  const groups = new Map<string, number[]>();
  for (let d = 0; d < 7; d++) {
    const list = windowsOf(all, d);
    if (list.length === 0) continue;
    const key = list.map((w) => `${w.start}–${w.end}`).join(' e ');
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()]
    .map(([key, days]) => {
      const consecutive = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
      const label = days.length === 1 ? WEEKDAYS_SHORT[days[0]!] : consecutive && days.length > 2 ? `${WEEKDAYS_SHORT[days[0]!]} a ${WEEKDAYS_SHORT[days[days.length - 1]!]}` : days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
      return `${label}, ${key}`;
    })
    .join('; ');
}

const FALLBACK_ZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha', 'America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Bogota', 'America/Mexico_City', 'America/New_York', 'Europe/Lisbon', 'Europe/London', 'UTC'];

const BRAZIL_FIRST = ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'];

export function timezoneOptions(current?: string): { value: string; label: string }[] {
  let all: string[] = FALLBACK_ZONES;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) all = supported;
  } catch {
    // mantém a lista curta
  }
  const rest = all.filter((z) => !BRAZIL_FIRST.includes(z));
  const list = [...BRAZIL_FIRST, ...rest];
  if (current && !list.includes(current)) list.unshift(current);
  return list.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}

/** "dd/MM/yyyy" a partir de "AAAA-MM-DD", sem passar por fuso (data civil). */
export function formatCivilDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Dia da semana (seg..dom) de uma data civil. */
export function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(y!, (m ?? 1) - 1, d)).getUTCDay(); // 0 = domingo
  return WEEKDAYS_SHORT[(js + 6) % 7]!;
}
