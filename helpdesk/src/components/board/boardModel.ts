import type { BoardCard, BoardColumn, BoardData, BoardFilters } from '@/types/board';

/** Funções puras do quadro: filtros, busca, ordem local e cor de texto. */

export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function countActiveFilters(f: BoardFilters): number {
  return (f.query.trim() ? 1 : 0) + (f.assignee ? 1 : 0) + (f.priority ? 1 : 0) + (f.company ? 1 : 0) + (f.overdueOnly ? 1 : 0);
}

export function matchesFilters(card: BoardCard, f: BoardFilters): boolean {
  if (f.assignee === 'none' ? card.assigneeId !== undefined : f.assignee && card.assigneeId !== f.assignee) return false;
  if (f.priority && card.priority !== f.priority) return false;
  if (f.company && card.companyName !== f.company) return false;
  if (f.overdueOnly && !card.overdue) return false;
  const q = norm(f.query.trim());
  if (q) {
    const hay = norm([card.reference, String(card.ticketId), card.subject, card.requesterName, card.companyName ?? '', card.assigneeName ?? ''].join(' '));
    if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

/**
 * Ordem dentro da coluna. O backend não guarda ordem (devolve do mais novo ao mais antigo): a ordem escolhida ao
 * arrastar fica só neste navegador. Cartões novos (fora da lista salva) vêm primeiro, os salvos seguem a ordem salva.
 */
export function orderCards(cards: BoardCard[], saved: number[] | undefined): BoardCard[] {
  if (!saved || saved.length === 0) return cards;
  const rank = new Map(saved.map((id, i) => [id, i]));
  const fresh = cards.filter((c) => !rank.has(c.ticketId));
  const known = cards.filter((c) => rank.has(c.ticketId)).sort((a, b) => rank.get(a.ticketId)! - rank.get(b.ticketId)!);
  return [...fresh, ...known];
}

/** Lista de ids com `ticketId` inserido antes de `beforeId` (ou no fim). Tira a ocorrência anterior. */
export function insertBefore(ids: number[], ticketId: number, beforeId: number | null | undefined): number[] {
  const rest = ids.filter((id) => id !== ticketId);
  const at = beforeId == null ? -1 : rest.indexOf(beforeId);
  if (at < 0) return [...rest, ticketId];
  return [...rest.slice(0, at), ticketId, ...rest.slice(at)];
}

export interface ColumnView {
  column: BoardColumn;
  /** Cartões visíveis (depois dos filtros), na ordem de exibição. */
  cards: BoardCard[];
  /** Todos os cartões da coluna, sem filtros. */
  total: number;
}

export function buildColumns(data: BoardData, filters: BoardFilters, order: Record<string, number[]> | undefined): ColumnView[] {
  const byColumn = new Map<string, BoardCard[]>();
  for (const card of data.cards) {
    const list = byColumn.get(card.columnKey);
    if (list) list.push(card);
    else byColumn.set(card.columnKey, [card]);
  }
  return data.columns.map((column) => {
    const all = orderCards(byColumn.get(column.key) ?? [], order?.[column.key]);
    return { column, cards: all.filter((c) => matchesFilters(c, filters)), total: all.length };
  });
}

/** Chave de coluna de status do ticket (para "Soltar da coluna de organização"). */
export const stageColumnOf = (data: BoardData, card: BoardCard): BoardColumn | undefined => data.columns.find((c) => c.kind === 'stage' && c.key === card.stageKey);

export type WipState = 'none' | 'ok' | 'at' | 'over';
export function wipState(column: BoardColumn, total: number): WipState {
  if (column.wipLimit == null) return 'none';
  if (total > column.wipLimit) return 'over';
  return total === column.wipLimit ? 'at' : 'ok';
}

/** Dias de atraso/restantes do prazo interno, em texto curto. */
export function dueText(dueAt: string, now: Date = new Date()): string {
  const d = new Date(dueAt);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  return date;
}
const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** `YYYY-MM-DD` local de um ISO (para `<input type="date">`). */
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Prazo = fim do dia local escolhido (18h), em ISO. */
export function dateInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 18, 0, 0).toISOString();
}
