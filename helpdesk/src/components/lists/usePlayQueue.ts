import { create } from 'zustand';

/** Fila do botão ▶ Play: a tela do ticket pode chamar `next()` para percorrer a visualização. */
interface PlayState {
  viewId: string | null;
  ids: number[];
  index: number;
  start: (viewId: string, ids: number[]) => number | null;
  /** Avança e devolve o id do próximo ticket (ou `null` ao terminar). */
  next: () => number | null;
  stop: () => void;
}

export const usePlayQueue = create<PlayState>()((set, get) => ({
  viewId: null,
  ids: [],
  index: -1,
  start: (viewId, ids) => {
    if (ids.length === 0) return null;
    set({ viewId, ids, index: 0 });
    return ids[0];
  },
  next: () => {
    const { ids, index } = get();
    if (index + 1 >= ids.length) {
      set({ viewId: null, ids: [], index: -1 });
      return null;
    }
    set({ index: index + 1 });
    return ids[index + 1];
  },
  stop: () => set({ viewId: null, ids: [], index: -1 }),
}));
