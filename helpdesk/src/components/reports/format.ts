const NUM = new Intl.NumberFormat('pt-BR');
const DEC1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n: number): string => NUM.format(n);
export const fmtDecimal = (n: number): string => DEC1.format(n);

/** Duração em segundos: "45 s", "12 min", "1 h 38 min", "2 d 3 h". `null` vira "Sem dados". */
export function fmtSeconds(total: number | null | undefined): string {
  if (total === null || total === undefined) return 'Sem dados';
  const s = Math.max(0, Math.round(total));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h} h ${rm} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

export const fmtMinutes = (minutes: number | null | undefined): string => (minutes === null || minutes === undefined ? 'Sem dados' : fmtSeconds(minutes * 60));

/** Percentual de `part` sobre `whole`; `null` quando não há base (nunca "0%" inventado). */
export function pct(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  const v = (part / whole) * 100;
  return `${v >= 99.95 || v === 0 || Number.isInteger(v) ? Math.round(v) : DEC1.format(v)}%`;
}

export const fmtScore = (n: number | null | undefined): string => (n === null || n === undefined ? 'Sem dados' : DEC1.format(n));

/** Variação percentual com sinal: "+12,5%". */
export function fmtVariation(v: number): string {
  const abs = Math.abs(v);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${abs >= 100 ? NUM.format(Math.round(abs)) : DEC1.format(abs)}%`;
}
