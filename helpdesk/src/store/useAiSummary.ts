import { create } from 'zustand';
import { generateAiSummary } from '@/api/tickets';
import type { AiSummary } from '@/types/domain';

/**
 * Resumo de IA por ticket, SÓ em memória (some ao recarregar a página): o servidor não grava o resumo e o front
 * também não o persiste (nada em localStorage/sessionStorage/IndexedDB).
 */
export type AiSummaryEntry =
  | { status: 'loading'; summary?: AiSummary }
  | { status: 'done'; summary: AiSummary }
  /** `code` `ai_not_configured` (503) não é falha: o recurso só não foi ligado nesta conta. */
  | { status: 'error'; error: string; code?: string; summary?: AiSummary };

interface AiSummaryState {
  byTicket: Record<number, AiSummaryEntry>;
  generate: (ticketId: number) => Promise<void>;
  clear: (ticketId: number) => void;
}

export const useAiSummary = create<AiSummaryState>()((set, get) => ({
  byTicket: {},
  generate: async (ticketId) => {
    if (get().byTicket[ticketId]?.status === 'loading') return;
    const previous = get().byTicket[ticketId]?.summary;
    set((s) => ({ byTicket: { ...s.byTicket, [ticketId]: { status: 'loading', summary: previous } } }));
    try {
      const summary = await generateAiSummary(ticketId);
      set((s) => ({ byTicket: { ...s.byTicket, [ticketId]: { status: 'done', summary } } }));
    } catch (e) {
      const err = e as { message?: string; code?: string };
      set((s) => ({ byTicket: { ...s.byTicket, [ticketId]: { status: 'error', error: err.message ?? 'Não foi possível gerar o resumo.', code: err.code, summary: previous } } }));
    }
  },
  clear: (ticketId) =>
    set((s) => {
      const { [ticketId]: _gone, ...rest } = s.byTicket;
      return { byTicket: rest };
    }),
}));
