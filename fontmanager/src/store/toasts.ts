import { create } from "zustand";

export interface Toast { id: number; tone: "info" | "success" | "error" | "warning"; text: string }
let n = 0;

export const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, "id">, ms?: number) => void; dismiss: (id: number) => void }>((set, get) => ({
  list: [],
  push: (t, ms = 6000) => {
    const id = ++n;
    set((s) => ({ list: [...s.list.slice(-3), { ...t, id }] }));
    if (ms > 0) setTimeout(() => get().dismiss(id), t.tone === "error" ? Math.max(ms, 10000) : ms);
  },
  dismiss: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}));
