import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { useFormEntry } from '../formStore';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import type { Ticket } from '@/types/domain';

export type PanelId = 'customer' | 'knowledge' | 'side' | 'merge' | 'approval' | 'tasks' | 'apps';

interface PanelState {
  open: PanelId | null;
  /** Um painel por vez; clicar no aberto fecha. */
  toggle: (id: PanelId) => void;
  close: () => void;
}

export const useRightPanel = create<PanelState>()((set) => ({
  open: null,
  toggle: (id) => set((s) => ({ open: s.open === id ? null : id })),
  close: () => set({ open: null }),
}));

/** Tickets não resolvidos do mesmo solicitante (exceto o atual). */
export function useMergeSuggestions(ticketKey: string | null): Ticket[] {
  const entry = useFormEntry(ticketKey ?? '');
  const tickets = useTickets((s) => s.tickets);
  const statuses = useTickets((s) => s.statuses);
  const requesterId = entry?.values.requesterId ?? null;
  if (!requesterId) return [];
  const currentId = entry?.ticketId ?? null;
  return tickets.filter((t) => {
    if (t.requesterId !== requesterId || t.id === currentId) return false;
    return statuses.find((s) => s.id === t.statusId)?.category !== 'solved';
  });
}

/** Chave do formulário da tela atual (ticket:ID pela rota; new-ticket:N pela aba ativa); `null` fora de ticket. */
export function useActiveTicketKey(): string | null {
  const { pathname } = useLocation();
  const activeTab = useTabs((s) => s.activeTabId);
  const m = /^\/agent\/tickets\/(\d+)\/?$/.exec(pathname);
  if (m) return `ticket:${m[1]}`;
  return /^\/agent\/tickets\/new\/?$/.test(pathname) && activeTab?.startsWith('new-ticket:') ? activeTab : null;
}
