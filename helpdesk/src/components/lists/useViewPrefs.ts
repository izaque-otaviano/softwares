import { create } from 'zustand';
import { DEFAULT_COLUMNS, EMPTY_FILTERS, type SortSpec, type ViewFilters } from './viewQuery';

/** Preferências por visualização, só em memória (somem ao recarregar a página). */
interface ViewPrefsState {
  filters: Record<string, ViewFilters>;
  columns: Record<string, string[]>;
  sort: Record<string, SortSpec | null>;
  grouped: Record<string, boolean>;
  setFilters: (viewId: string, f: ViewFilters) => void;
  setColumns: (viewId: string, cols: string[]) => void;
  setSort: (viewId: string, s: SortSpec | null) => void;
  setGrouped: (viewId: string, g: boolean) => void;
  resetColumns: (viewId: string) => void;
  reset: () => void;
}

export const useViewPrefs = create<ViewPrefsState>()((set) => ({
  filters: {},
  columns: {},
  sort: {},
  grouped: {},
  setFilters: (viewId, f) => set((s) => ({ filters: { ...s.filters, [viewId]: f } })),
  setColumns: (viewId, cols) => set((s) => ({ columns: { ...s.columns, [viewId]: cols } })),
  setSort: (viewId, v) => set((s) => ({ sort: { ...s.sort, [viewId]: v } })),
  setGrouped: (viewId, g) => set((s) => ({ grouped: { ...s.grouped, [viewId]: g } })),
  resetColumns: (viewId) =>
    set((s) => {
      const { [viewId]: _drop, ...rest } = s.columns;
      return { columns: rest };
    }),
  reset: () => set({ filters: {}, columns: {}, sort: {}, grouped: {} }),
}));

export const filtersOf = (s: ViewPrefsState, viewId: string): ViewFilters => s.filters[viewId] ?? EMPTY_FILTERS;
export const columnsOf = (s: ViewPrefsState, viewId: string, fallback?: string[]): string[] =>
  s.columns[viewId] ?? fallback ?? DEFAULT_COLUMNS;
