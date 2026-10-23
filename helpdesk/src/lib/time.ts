import { differenceInMinutes, format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SlaState } from '@/types/domain';

/** "há 11 minutos", "há cerca de 2 horas". */
export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Math.abs(now.getTime() - date.getTime()) < 45_000) return 'agora mesmo';
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

/** "hoje às 14:05", "ontem às 09:30", "12 de out. de 2025, 09:30". */
export function absoluteTime(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (isToday(date)) return `hoje às ${format(date, 'HH:mm', { locale: ptBR })}`;
  if (isYesterday(date)) return `ontem às ${format(date, 'HH:mm', { locale: ptBR })}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return format(date, sameYear ? "d 'de' MMM, HH:mm" : "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR });
}

/** Duração curta em minutos inteiros: 49m, 1h 20m, 2h, 3d 4h. */
export function shortDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

export interface SlaDisplay {
  state: SlaState;
  /** "49m", "1h 20m", "<1m", "Estourado há 12m" ou "Estourado agora" (< 1 min). "Cumprido" quando o SLA já foi cumprido. */
  label: string;
}

/**
 * Texto da pílula de SLA. `warning` quando faltam ≤ `warnAtMinutes` (padrão 60) e `breached` depois do vencimento.
 * Um estado `met` vindo dos dados é respeitado.
 */
export function slaDisplay(
  dueAt: string | Date,
  state: SlaState | undefined,
  now: Date = new Date(),
  warnAtMinutes = 60,
): SlaDisplay {
  if (state === 'met') return { state: 'met', label: 'Cumprido' };
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  const minutes = differenceInMinutes(due, now);
  if (due.getTime() < now.getTime()) {
    // differenceInMinutes trunca: nos primeiros 59 s depois do vencimento daria "Estourado há 0m".
    const overdue = differenceInMinutes(now, due);
    return { state: 'breached', label: overdue < 1 ? 'Estourado agora' : `Estourado há ${shortDuration(overdue)}` };
  }
  // Faltando menos de 1 min (ainda dentro do prazo) "0m" pareceria já estourado.
  return { state: minutes <= warnAtMinutes ? 'warning' : 'ok', label: minutes < 1 ? '<1m' : shortDuration(minutes) };
}

/** Espera em segundos para a tela ("45 s", "58 min 20 s", "1 h 02 min"). */
export function waitText(totalSeconds: number): string {
  const t = Math.max(0, Math.ceil(totalSeconds));
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60);
  if (m < 60) return `${m} min ${String(t % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
