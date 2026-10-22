import { useCallback, useMemo } from 'react';
import { useUi } from '@/store/useUi';
import { clampWidth, insertByDefinitionOrder, isHideable, resolveVisibleIds, resolveWidth } from './columns';
import type { ColumnDef } from './types';

export interface UseTableColumnsResult<T> {
  /** Colunas visíveis, na ordem de exibição. */
  columns: ColumnDef<T>[];
  /** Colunas que o usuário pode mostrar/ocultar (para o ColumnsMenu). */
  hideableColumns: ColumnDef<T>[];
  /** Largura efetiva em px de cada coluna visível, por id. */
  widths: Record<string, number>;
  isVisible: (columnId: string) => boolean;
  /** Mostra/oculta uma coluna `hideable`. Persiste no store. */
  setVisible: (columnId: string, visible: boolean) => void;
  /** Define quais colunas aparecem e em que ordem (ex.: gaveta "Gerenciar colunas"). */
  setVisibleColumns: (columnIds: string[]) => void;
  /** Define a largura de uma coluna (respeita o mínimo). Persiste no store. */
  setWidth: (columnId: string, width: number) => void;
  /** Volta à visibilidade e às larguras originais das definições. */
  reset: () => void;
}

/**
 * Colunas visíveis e larguras de uma tabela, persistidas por `id` em `useUi.tableColumns`.
 * A Table usa o mesmo hook, então um menu fora dela (ColumnsMenu, gaveta de colunas) fica sempre em sincronia.
 */
export function useTableColumns<T>(id: string, columns: ColumnDef<T>[]): UseTableColumnsResult<T> {
  const prefs = useUi((state) => state.tableColumns[id]);
  const setTableColumns = useUi((state) => state.setTableColumns);

  const savedVisible = prefs?.visible;
  const savedWidths = prefs?.widths;

  const visibleIds = useMemo(() => resolveVisibleIds(columns, savedVisible), [columns, savedVisible]);

  const visibleColumns = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]));
    return visibleIds.flatMap((columnId) => {
      const column = byId.get(columnId);
      return column ? [column] : [];
    });
  }, [columns, visibleIds]);

  const hideableColumns = useMemo(() => columns.filter(isHideable), [columns]);

  const widths = useMemo(() => {
    const out: Record<string, number> = {};
    for (const column of visibleColumns) out[column.id] = resolveWidth(column, savedWidths);
    return out;
  }, [visibleColumns, savedWidths]);

  const isVisible = useCallback((columnId: string) => visibleIds.includes(columnId), [visibleIds]);

  const setVisibleColumns = useCallback(
    (columnIds: string[]) => setTableColumns(id, { visible: resolveVisibleIds(columns, columnIds) }),
    [id, columns, setTableColumns],
  );

  const setVisible = useCallback(
    (columnId: string, visible: boolean) => {
      const column = columns.find((c) => c.id === columnId);
      if (!column || !isHideable(column)) return;
      // Lê o estado mais recente: dois cliques seguidos no menu não podem partir de um valor velho.
      const current = resolveVisibleIds(columns, useUi.getState().tableColumns[id]?.visible);
      const next = visible ? insertByDefinitionOrder(columns, current, columnId) : current.filter((c) => c !== columnId);
      setTableColumns(id, { visible: next });
    },
    [id, columns, setTableColumns],
  );

  const setWidth = useCallback(
    (columnId: string, width: number) => {
      const column = columns.find((c) => c.id === columnId);
      if (!column) return;
      const current = useUi.getState().tableColumns[id]?.widths ?? {};
      setTableColumns(id, { widths: { ...current, [columnId]: clampWidth(column, width) } });
    },
    [id, columns, setTableColumns],
  );

  const reset = useCallback(() => setTableColumns(id, { visible: undefined, widths: undefined }), [id, setTableColumns]);

  return { columns: visibleColumns, hideableColumns, widths, isVisible, setVisible, setVisibleColumns, setWidth, reset };
}
