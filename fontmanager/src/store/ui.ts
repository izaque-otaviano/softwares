import { create } from "zustand";
import type { Phase } from "@/lib/types";

export type View = "all" | "active" | "local" | "favorites" | "collection" | "providers" | "settings";
export type Theme = "system" | "light" | "dark";

interface UiState {
  view: View;
  collectionId: number | null;
  search: string;
  category: string;
  provider: string;
  variableOnly: boolean;
  italicOnly: boolean;
  layout: "list" | "grid";
  previewText: string;
  previewSize: number;
  previewWeight: number;
  previewItalic: boolean;
  selected: string | null;
  compare: string[];
  compareOpen: boolean;
  theme: Theme;
  /** Fase mais recente de cada ativação em andamento/concluída nesta sessão. */
  phases: Record<string, Phase & { at: number }>;
  setView: (v: View, collectionId?: number | null) => void;
  set: <K extends keyof UiState>(k: K, v: UiState[K]) => void;
  toggleCompare: (key: string) => void;
  setPhase: (key: string, p: Phase | null) => void;
}

const DEFAULT_TEXT = "Pack my box with five dozen liquor jugs";

export const useUi = create<UiState>((set) => ({
  view: "all",
  collectionId: null,
  search: "",
  category: "",
  provider: "",
  variableOnly: false,
  italicOnly: false,
  layout: "list",
  previewText: DEFAULT_TEXT,
  previewSize: 36,
  previewWeight: 400,
  previewItalic: false,
  selected: null,
  compare: [],
  compareOpen: false,
  theme: "system",
  phases: {},
  setView: (view, collectionId = null) => set({ view, collectionId, selected: null }),
  set: (k, v) => set({ [k]: v } as Partial<UiState>),
  toggleCompare: (key) =>
    set((s) => ({ compare: s.compare.includes(key) ? s.compare.filter((k) => k !== key) : [...s.compare, key].slice(0, 6) })),
  setPhase: (key, p) =>
    set((s) => {
      const phases = { ...s.phases };
      if (p) phases[key] = { ...p, at: Date.now() };
      else delete phases[key];
      return { phases };
    }),
}));

export { DEFAULT_TEXT };
