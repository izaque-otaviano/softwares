import { create } from 'zustand';
import { trackViewed } from '@/api/search';

export type TabKind = 'ticket' | 'new-ticket' | 'user' | 'org' | 'search';

export interface WorkTab {
  /** `${kind}:${refId}`. */
  id: string;
  kind: TabKind;
  /** id do ticket/usuário/org, termo da busca, ou contador do novo ticket. */
  refId: string;
  title: string;
  subtitle?: string;
  /** Só `ticket`: define o ícone (envelope/fone). */
  channel?: 'email' | 'web_form';
  /** Alterações não salvas (ponto na aba). */
  dirty: boolean;
}

export interface OpenTabInput {
  kind: TabKind;
  /** Obrigatório exceto em `new-ticket` (gera um id novo a cada abertura). */
  refId?: string | number;
  title: string;
  subtitle?: string;
  channel?: 'email' | 'web_form';
}

export interface RecentTicket {
  ticketId: number;
  title: string;
  requesterName?: string;
  statusId?: string;
}

interface TabsState {
  tabs: WorkTab[];
  activeTabId: string | null;
  recent: RecentTicket[];

  /** Abre a aba ou foca a existente (mesma chave tipo+id). Devolve o id da aba. */
  openTab: (input: OpenTabInput) => string;
  setActive: (id: string | null) => void;
  /** Fecha sem perguntar (use depois da confirmação). */
  closeTab: (id: string) => void;
  /** Se a aba estiver suja devolve `{ needsConfirm: true }` e não fecha; senão fecha. */
  requestClose: (id: string) => { needsConfirm: boolean };
  setDirty: (id: string, dirty: boolean) => void;
  updateTab: (id: string, patch: Partial<Pick<WorkTab, 'title' | 'subtitle'>>) => void;
  addRecent: (entry: RecentTicket) => void;
}

let newTicketSeq = 0;

export const useTabs = create<TabsState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  recent: [],

  openTab: (input) => {
    const refId = input.kind === 'new-ticket' ? String(input.refId ?? ++newTicketSeq) : String(input.refId ?? '');
    const id = `${input.kind}:${refId}`;
    const exists = get().tabs.some((t) => t.id === id);
    if (!exists) {
      const tab: WorkTab = { id, kind: input.kind, refId, title: input.title, subtitle: input.subtitle, channel: input.channel, dirty: false };
      set((s) => ({ tabs: [...s.tabs, tab] }));
    }
    set({ activeTabId: id });
    if (input.kind === 'ticket') {
      get().addRecent({ ticketId: Number(refId), title: input.title, requesterName: input.subtitle });
      trackViewed({ kind: 'ticket', id: refId, title: input.title, meta: input.subtitle ?? 'Ticket' });
    } else if (input.kind === 'user' || input.kind === 'org') {
      trackViewed({ kind: input.kind, id: refId, title: input.title, meta: input.kind === 'user' ? 'Usuário' : 'Organização' });
    }
    return id;
  },

  setActive: (id) => set({ activeTabId: id }),

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? (tabs[idx] ?? tabs[idx - 1])?.id ?? null : s.activeTabId;
      return { tabs, activeTabId };
    }),

  requestClose: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.dirty) return { needsConfirm: true };
    get().closeTab(id);
    return { needsConfirm: false };
  },

  setDirty: (id, dirty) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id && t.dirty !== dirty ? { ...t, dirty } : t)) })),

  updateTab: (id, patch) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  addRecent: (entry) =>
    set((s) => ({ recent: [entry, ...s.recent.filter((r) => r.ticketId !== entry.ticketId)].slice(0, 10) })),
}));
