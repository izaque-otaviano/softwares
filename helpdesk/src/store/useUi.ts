import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Toasts ficam fora do `persist`: só tema, sidebar e colunas das tabelas vão para o localStorage. */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Ação opcional (ex.: "Desfazer", "Tentar novamente"). */
  action?: { label: string; onClick: () => void };
  /** ms até fechar sozinho. 0 = fica até o usuário fechar. Padrão: 4000 (erros: 0). */
  duration?: number;
}

export interface TableColumnPrefs {
  /** ids das colunas visíveis, na ordem de exibição. */
  visible?: string[];
  /** larguras em px por id de coluna. */
  widths?: Record<string, number>;
}

interface UiState {
  theme: 'light';
  sidebarCollapsed: boolean;
  /** Largura do painel secundário por página (px). */
  sidebarWidths: Record<string, number>;
  tableColumns: Record<string, TableColumnPrefs>;
  toasts: ToastItem[];

  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (pageKey: string, width: number) => void;
  setTableColumns: (tableId: string, prefs: TableColumnPrefs) => void;
  pushToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

let toastSeq = 0;

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarCollapsed: false,
      sidebarWidths: {},
      tableColumns: {},
      toasts: [],

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setSidebarWidth: (pageKey, width) => set((s) => ({ sidebarWidths: { ...s.sidebarWidths, [pageKey]: width } })),
      setTableColumns: (tableId, prefs) =>
        set((s) => ({ tableColumns: { ...s.tableColumns, [tableId]: { ...s.tableColumns[tableId], ...prefs } } })),
      pushToast: (toast) => {
        const id = `toast-${++toastSeq}`;
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-4) }));
        return id;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'helpdesk:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, sidebarCollapsed, sidebarWidths, tableColumns }) => ({
        theme,
        sidebarCollapsed,
        sidebarWidths,
        tableColumns,
      }),
    },
  ),
);

/** API imperativa para disparar toasts fora de componentes. */
export const toast = {
  success: (title: string, opts: Omit<ToastItem, 'id' | 'tone' | 'title'> = {}) => useUi.getState().pushToast({ tone: 'success', title, ...opts }),
  error: (title: string, opts: Omit<ToastItem, 'id' | 'tone' | 'title'> = {}) => useUi.getState().pushToast({ tone: 'error', title, ...opts }),
  info: (title: string, opts: Omit<ToastItem, 'id' | 'tone' | 'title'> = {}) => useUi.getState().pushToast({ tone: 'info', title, ...opts }),
  dismiss: (id: string) => useUi.getState().dismissToast(id),
};
