import type { ColumnDef, SortState, TableErrorConfig } from './types';

/* Lógica pura das colunas (sem React, sem store): resolução de visibilidade, larguras e ordenação. */

export const DEFAULT_COLUMN_WIDTH = 160;
export const DEFAULT_MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 800;
/** Passo das setas na alça de redimensionar; com Shift usa o passo grande. */
export const RESIZE_STEP = 8;
export const RESIZE_STEP_LARGE = 24;

/** `hideable` é opt-in; `defaultHidden` implica `hideable` (senão a coluna oculta nunca poderia ser exibida). */
export function isHideable<T>(column: ColumnDef<T>): boolean {
  return column.hideable === true || column.defaultHidden === true;
}

export function columnLabel<T>(column: ColumnDef<T>): string {
  if (column.label) return column.label;
  return typeof column.header === 'string' && column.header !== '' ? column.header : column.id;
}

export function minWidthOf<T>(column: ColumnDef<T>): number {
  const min = column.minWidth ?? Math.min(DEFAULT_MIN_COLUMN_WIDTH, column.width ?? DEFAULT_MIN_COLUMN_WIDTH);
  return Math.min(min, MAX_COLUMN_WIDTH);
}

export function clampWidth<T>(column: ColumnDef<T>, width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(minWidthOf(column), Math.round(width)));
}

/** Largura efetiva: a salva pelo usuário, senão a `width` da definição, senão o padrão. */
export function resolveWidth<T>(column: ColumnDef<T>, saved?: Readonly<Record<string, number>>): number {
  const stored = saved?.[column.id];
  return clampWidth(column, typeof stored === 'number' && Number.isFinite(stored) ? stored : (column.width ?? DEFAULT_COLUMN_WIDTH));
}

/** Insere `columnId` depois da última coluna já presente que o antecede na definição. */
export function insertByDefinitionOrder<T>(columns: readonly ColumnDef<T>[], ids: readonly string[], columnId: string): string[] {
  if (ids.includes(columnId)) return [...ids];
  const target = columns.findIndex((c) => c.id === columnId);
  if (target < 0) return [...ids];
  let position = 0;
  for (let i = 0; i < target; i += 1) {
    const at = ids.indexOf(columns[i].id);
    if (at >= position) position = at + 1;
  }
  return [...ids.slice(0, position), columnId, ...ids.slice(position)];
}

/**
 * Ids das colunas visíveis, na ordem de exibição.
 * - Sem preferência salva: todas as colunas, menos as `defaultHidden`.
 * - Com preferência: a ordem salva (ids desconhecidos e repetidos são descartados). Colunas que o usuário
 *   não pode ocultar (`!hideable`) estão sempre presentes, mesmo que faltem na lista salva.
 */
export function resolveVisibleIds<T>(columns: readonly ColumnDef<T>[], saved?: readonly string[]): string[] {
  if (!saved) return columns.filter((c) => c.defaultHidden !== true).map((c) => c.id);
  const known = new Set(columns.map((c) => c.id));
  let ids: string[] = [];
  for (const id of saved) if (known.has(id) && !ids.includes(id)) ids.push(id);
  for (const column of columns) if (!isHideable(column)) ids = insertByDefinitionOrder(columns, ids, column.id);
  return ids;
}

/** Ciclo do clique no cabeçalho: ⇅ (sem ordenação, null) -> ↑ crescente -> ↓ decrescente -> ⇅. */
export function nextSort(current: SortState | null | undefined, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
  return current.direction === 'asc' ? { columnId, direction: 'desc' } : null;
}

/** Distingue `{ message, onRetry }` de um ReactNode qualquer. */
export function isErrorConfig(error: unknown): error is TableErrorConfig {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { message?: unknown; onRetry?: unknown };
  return typeof candidate.message === 'string' && typeof candidate.onRetry === 'function';
}
