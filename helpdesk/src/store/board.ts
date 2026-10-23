import { create } from 'zustand';
import * as api from '@/api/board';
import { getTicket } from '@/api/tickets';
import { buildColumns, insertBefore, type ColumnView } from '@/components/board/boardModel';
import { errMessage } from '@/lib/apiError';
import { useTickets } from '@/store/useTickets';
import { toast } from '@/store/useUi';
import { EMPTY_BOARD_FILTERS, type BoardCard, type BoardData, type BoardFilters, type BoardSummary } from '@/types/board';

type Phase = 'idle' | 'loading' | 'ready' | 'error';
const ACTIVE_KEY = 'helpdesk.board.active';

const readActive = (): number | null => {
  try {
    const v = Number(localStorage.getItem(ACTIVE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const writeActive = (id: number | null): void => {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    /* sem armazenamento: só não lembra */
  }
};

interface BoardState {
  boards: BoardSummary[];
  boardsPhase: Phase;
  boardsError?: string;
  activeId: number | null;
  data: BoardData | null;
  phase: Phase;
  error?: string;
  filters: BoardFilters;
  /** Ordem dentro da coluna escolhida ao arrastar: SÓ neste navegador (o backend não guarda). `{quadro: {coluna: [ticketId]}}`. */
  localOrder: Record<number, Record<string, number[]>>;
  /** Tickets com um pedido em andamento. */
  busy: number[];

  loadBoards: () => Promise<void>;
  selectBoard: (id: number) => Promise<void>;
  reload: (silent?: boolean) => Promise<void>;
  setFilters: (patch: Partial<BoardFilters>) => void;
  clearFilters: () => void;
  moveCard: (ticketId: number, columnKey: string, beforeId?: number | null) => Promise<boolean>;
  setDue: (ticketId: number, dueAt: string | null) => Promise<boolean>;
  setWipLimit: (columnKey: string, limit: number | null) => Promise<boolean>;
  createBoard: (name: string) => Promise<boolean>;
  renameBoard: (name: string) => Promise<boolean>;
  deleteBoard: () => Promise<boolean>;
  createLane: (name: string) => Promise<boolean>;
  renameLane: (laneId: number, name: string) => Promise<boolean>;
  moveLane: (laneId: number, delta: -1 | 1) => Promise<boolean>;
  deleteLane: (laneId: number) => Promise<boolean>;
}

let inflight = 0;
let loadSeq = 0;

const initial = (): Pick<BoardState, 'boards' | 'boardsPhase' | 'boardsError' | 'activeId' | 'data' | 'phase' | 'error' | 'filters' | 'localOrder' | 'busy'> => ({
  boards: [],
  boardsPhase: 'idle',
  boardsError: undefined,
  activeId: null,
  data: null,
  phase: 'idle',
  error: undefined,
  filters: { ...EMPTY_BOARD_FILTERS },
  localOrder: {},
  busy: [],
});

export const useBoard = create<BoardState>()((set, get) => {
  /** Roda uma escrita; ao terminar a última em andamento, troca o quadro pelo que o servidor devolveu. */
  async function write(run: (boardId: number) => Promise<BoardData | void>, errorTitle: string): Promise<boolean> {
    const boardId = get().activeId;
    if (boardId == null) return false;
    inflight += 1;
    try {
      const result = await run(boardId);
      inflight -= 1;
      if (get().activeId !== boardId) return true;
      if (result) {
        if (inflight === 0) set({ data: result, phase: 'ready', error: undefined });
      } else {
        await get().reload(true);
      }
      return true;
    } catch (e) {
      inflight -= 1;
      toast.error(errorTitle, { description: errMessage(e, 'Tente novamente.') });
      return false;
    }
  }

  const setOrder = (boardId: number, columnKey: string, ids: number[]) =>
    set((s) => ({ localOrder: { ...s.localOrder, [boardId]: { ...s.localOrder[boardId], [columnKey]: ids } } }));

  const currentIds = (columnKey: string): number[] => {
    const { data, localOrder, activeId } = get();
    if (!data || activeId == null) return [];
    // A ordem completa da coluna, ignorando filtros (a ordem salva vale para todos os cartões).
    const view = buildColumns(data, EMPTY_BOARD_FILTERS, localOrder[activeId]).find((c) => c.column.key === columnKey);
    return view?.cards.map((c) => c.ticketId) ?? [];
  };

  return {
    ...initial(),

    loadBoards: async () => {
      set({ boardsPhase: 'loading', boardsError: undefined });
      try {
        const boards = await api.listBoards();
        const saved = get().activeId ?? readActive();
        const activeId = boards.find((b) => b.id === saved)?.id ?? boards[0]?.id ?? null;
        set({ boards, boardsPhase: 'ready', activeId });
        if (activeId != null) await get().reload();
        else set({ data: null, phase: 'idle' });
      } catch (e) {
        set({ boardsPhase: 'error', boardsError: errMessage(e, 'Não foi possível carregar os quadros.') });
      }
    },

    selectBoard: async (id) => {
      if (get().activeId === id && get().phase === 'ready') return;
      writeActive(id);
      set({ activeId: id, data: null, filters: { ...EMPTY_BOARD_FILTERS } });
      await get().reload();
    },

    reload: async (silent = false) => {
      const boardId = get().activeId;
      if (boardId == null) return;
      const seq = ++loadSeq;
      if (!silent) set({ phase: 'loading', error: undefined });
      try {
        const data = await api.getBoard(boardId);
        // Resposta velha, quadro trocado ou escrita em andamento (o servidor devolverá o estado dela): descarta.
        if (seq !== loadSeq || get().activeId !== boardId || inflight > 0) return;
        set({ data, phase: 'ready', error: undefined });
      } catch (e) {
        if (seq !== loadSeq || get().activeId !== boardId) return;
        if (silent && get().data) return; // atualização em segundo plano falhou: mantém o que está na tela
        set({ phase: 'error', error: errMessage(e, 'Não foi possível carregar o quadro.') });
      }
    },

    setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
    clearFilters: () => set({ filters: { ...EMPTY_BOARD_FILTERS } }),

    moveCard: async (ticketId, columnKey, beforeId) => {
      const { data, activeId } = get();
      if (!data || activeId == null) return false;
      const card = data.cards.find((c) => c.ticketId === ticketId);
      const column = data.columns.find((c) => c.key === columnKey);
      if (!card || !column) return false;

      // Reordenar dentro da mesma coluna: só local (o backend não guarda ordem).
      if (card.columnKey === columnKey) {
        if (beforeId === ticketId) return true;
        setOrder(activeId, columnKey, insertBefore(currentIds(columnKey), ticketId, beforeId));
        return true;
      }
      if (column.concludes) {
        toast.error(`${card.reference} não pode ser concluído arrastando`, {
          description: 'Para resolver o ticket, abra-o e use o fluxo de fechamento (datas de solução).',
        });
        return false;
      }

      const fromColumn = data.columns.find((c) => c.key === card.columnKey);
      const previous: BoardCard = card;
      const previousOrder = get().localOrder[activeId]?.[columnKey];
      const target = column.kind === 'stage' ? ({ kind: 'stage', stageId: column.stageId! } as const) : ({ kind: 'lane', laneId: column.laneId! } as const);
      const moved: BoardCard = column.kind === 'stage' ? { ...card, columnKey, stageKey: columnKey, category: column.category ?? card.category } : { ...card, columnKey };
      set((s) => ({ data: s.data && { ...s.data, cards: s.data.cards.map((c) => (c.ticketId === ticketId ? moved : c)) }, busy: [...s.busy, ticketId] }));
      if (beforeId !== undefined) setOrder(activeId, columnKey, insertBefore(currentIds(columnKey), ticketId, beforeId));

      const ok = await write((boardId) => api.placeCard(boardId, ticketId, target), `Não foi possível mover ${card.reference}`);
      set((s) => ({ busy: s.busy.filter((id) => id !== ticketId) }));
      if (!ok) {
        // Reverte só este cartão (outras mudanças em andamento seguem).
        set((s) => ({ data: s.data && { ...s.data, cards: s.data.cards.map((c) => (c.ticketId === ticketId ? previous : c)) } }));
        if (beforeId !== undefined) {
          const rest = { ...get().localOrder[activeId] };
          if (previousOrder) rest[columnKey] = previousOrder;
          else delete rest[columnKey];
          set((s) => ({ localOrder: { ...s.localOrder, [activeId]: rest } }));
        }
        toast.info(`${card.reference} voltou para ${fromColumn?.name ?? 'a coluna de origem'}`);
        return false;
      }
      if (column.kind === 'stage') void syncTicket(ticketId);
      return true;
    },

    setDue: (ticketId, dueAt) => write((id) => api.setCardDue(id, ticketId, dueAt), 'Não foi possível salvar o prazo'),
    setWipLimit: (columnKey, limit) => write((id) => api.setWipLimit(id, columnKey, limit), 'Não foi possível salvar o limite'),

    createBoard: async (name) => {
      try {
        const board = await api.createBoard(name);
        set((s) => ({ boards: [...s.boards, board] }));
        await get().selectBoard(board.id);
        toast.success(`Quadro "${board.name}" criado`);
        return true;
      } catch (e) {
        toast.error('Não foi possível criar o quadro', { description: errMessage(e, 'Tente novamente.') });
        return false;
      }
    },
    renameBoard: async (name) => {
      const id = get().activeId;
      if (id == null) return false;
      try {
        const board = await api.renameBoard(id, name);
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? board : b)) }));
        return true;
      } catch (e) {
        toast.error('Não foi possível renomear o quadro', { description: errMessage(e, 'Tente novamente.') });
        return false;
      }
    },
    deleteBoard: async () => {
      const id = get().activeId;
      if (id == null) return false;
      try {
        await api.deleteBoard(id);
        const boards = get().boards.filter((b) => b.id !== id);
        set({ boards, activeId: null, data: null, phase: 'idle' });
        writeActive(null);
        if (boards[0]) await get().selectBoard(boards[0].id);
        toast.success('Quadro excluído', { description: 'Os tickets não foram afetados.' });
        return true;
      } catch (e) {
        toast.error('Não foi possível excluir o quadro', { description: errMessage(e, 'Tente novamente.') });
        return false;
      }
    },

    createLane: (name) => write((id) => api.createLane(id, name), 'Não foi possível criar a coluna'),
    renameLane: (laneId, name) => write(() => api.renameLane(laneId, name), 'Não foi possível renomear a coluna'),
    deleteLane: (laneId) => write(() => api.deleteLane(laneId), 'Não foi possível excluir a coluna'),
    moveLane: async (laneId, delta) => {
      const data = get().data;
      if (!data) return false;
      const lanes = data.columns.filter((c) => c.kind === 'lane');
      const from = lanes.findIndex((c) => c.laneId === laneId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= lanes.length) return false;
      const reordered = [...lanes];
      [reordered[from], reordered[to]] = [reordered[to]!, reordered[from]!];
      const columns = [...data.columns.filter((c) => c.kind === 'stage'), ...reordered];
      set({ data: { ...data, columns } });
      const ok = await write(() => api.reorderLanes(reordered.map((c) => c.laneId!)), 'Não foi possível reordenar as colunas');
      if (!ok) set((s) => ({ data: s.data && { ...s.data, columns: data.columns } }));
      return ok;
    },
  };
});

/** O status do ticket mudou no quadro: atualiza a lista de tickets do resto do app. */
async function syncTicket(ticketId: number): Promise<void> {
  try {
    useTickets.getState().applyServerTicket(await getTicket(ticketId));
  } catch {
    /* a próxima leitura do ticket corrige */
  }
}

/** Só para testes. */
export function resetBoardStore(): void {
  inflight = 0;
  loadSeq += 1;
  useBoard.setState(initial());
}

export type { ColumnView };

const signature = (tickets: { id: number; updatedAt: string; statusId: string; assigneeId?: string }[]): string =>
  tickets.map((t) => `${t.id}:${t.updatedAt}:${t.statusId}:${t.assigneeId ?? ''}`).join('|');

/**
 * Tempo real: o app já recebe os eventos de ticket pelo WebSocket (`useTickets` os aplica na lista). Quando um ticket
 * muda ou chega, o quadro se recarrega em segundo plano (com atraso, e nunca no meio de um arraste). Devolve a função
 * que encerra a assinatura. Não mexe no `ws.ts`.
 */
export function startBoardLive(delayMs = 700): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = signature(useTickets.getState().tickets);
  const unsubscribe = useTickets.subscribe((state) => {
    const now = signature(state.tickets);
    if (now === last) return;
    last = now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (inflight === 0) void useBoard.getState().reload(true);
    }, delayMs);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
