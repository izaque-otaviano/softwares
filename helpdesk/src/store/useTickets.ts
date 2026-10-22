import { create } from 'zustand';
import * as api from '@/api/tickets';
import { listStatuses } from '@/api/meta';
import { countViews } from '@/lib/views';
import { runView as runViewPure } from '@/lib/views';
import { ME_ID } from '@/mocks/clock';
import { views as seedViews } from '@/mocks/views';
import type { AuditEvent, Priority, Ticket, TicketStatus, View } from '@/types/domain';
import { toast } from './useUi';

export type ViewCounts = Record<string, number | null>;

function nullCounts(views: View[]): ViewCounts {
  return Object.fromEntries(views.map((v) => [v.countKey, null]));
}

interface TicketsState {
  tickets: Ticket[];
  statuses: TicketStatus[];
  views: View[];
  /** Por `countKey`; `null` = carregando (a UI mostra "-"). */
  counts: ViewCounts;
  loaded: boolean;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  /** Zera os contadores (null) e busca de novo. */
  refreshCounts: () => Promise<void>;
  /** Tickets de uma view, avaliados sobre o estado atual da store. */
  ticketsForView: (viewId: string) => Ticket[];
  /** `silent: true` não dispara o toast padrão (quem chama mostra o próprio). */
  updateTicket: (id: number, patch: api.TicketPatch, comment?: api.NewComment, opts?: { silent?: boolean }) => Promise<Ticket>;
  createTicket: (input: api.NewTicketInput, opts?: { silent?: boolean }) => Promise<Ticket>;
  /** Grava o resultado do motor de gatilhos (patch + eventos) e atualiza a store, sem toast. */
  applyAutomation: (id: number, patch: api.TicketPatch, events: AuditEvent[]) => Promise<Ticket>;
  assignToMe: (ids: number[]) => Promise<boolean>;
  setStatus: (ids: number[], statusId: string) => Promise<boolean>;
  setPriority: (ids: number[], priority: Priority) => Promise<boolean>;
  deleteTickets: (ids: number[]) => Promise<boolean>;
  mergeTickets: (targetId: number, sourceIds: number[]) => Promise<boolean>;
}

function ctx(statuses: TicketStatus[]) {
  return { meId: ME_ID, now: new Date(), statuses };
}

export const useTickets = create<TicketsState>()((set, get) => {
  const recompute = (tickets: Ticket[]) => {
    const { views, statuses } = get();
    set({ tickets, counts: countViews(views, tickets, ctx(statuses)) });
  };
  const upsert = (list: Ticket[]) => {
    const map = new Map(get().tickets.map((t) => [t.id, t]));
    list.forEach((t) => map.set(t.id, t));
    recompute([...map.values()].sort((a, b) => a.id - b.id));
  };
  const bulk = async (ids: number[], patch: api.TicketPatch, okMessage: string): Promise<boolean> => {
    try {
      const updated = await Promise.all(ids.map((id) => api.updateTicket(id, patch)));
      upsert(updated);
      toast.success(okMessage);
      return true;
    } catch {
      toast.error('Não foi possível concluir a ação em lote.');
      return false;
    }
  };

  return {
    tickets: [],
    statuses: [],
    views: seedViews,
    counts: nullCounts(seedViews),
    loaded: false,
    loading: false,
    error: null,

    load: async () => {
      set({ loading: true, error: null });
      try {
        const [tickets, statuses, views, counts] = await Promise.all([
          api.listTickets(),
          listStatuses(),
          api.listViews(),
          api.getViewCounts(),
        ]);
        set({ tickets, statuses, views, counts, loaded: true, loading: false });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : 'Erro ao carregar tickets.' });
      }
    },

    refreshCounts: async () => {
      set({ counts: nullCounts(get().views) });
      set({ counts: await api.getViewCounts() });
    },

    ticketsForView: (viewId) => {
      const { views, tickets, statuses } = get();
      const view = views.find((v) => v.id === viewId);
      return view ? runViewPure(view, tickets, ctx(statuses)) : [];
    },

    updateTicket: async (id, patch, comment, opts) => {
      const updated = await api.updateTicket(id, patch, comment);
      upsert([updated]);
      if (!opts?.silent) toast.success(`Ticket #${id} foi atualizado`);
      return updated;
    },

    createTicket: async (input, opts) => {
      const created = await api.createTicket(input);
      upsert([created]);
      if (!opts?.silent) toast.success(`Ticket #${created.id} foi criado`);
      return created;
    },

    applyAutomation: async (id, patch, events) => {
      const updated = await api.applyAutomation(id, patch, events);
      upsert([updated]);
      return updated;
    },

    assignToMe: (ids) => bulk(ids, { assigneeId: ME_ID }, ids.length === 1 ? `Ticket #${ids[0]} atribuído a você` : `${ids.length} tickets atribuídos a você`),
    setStatus: (ids, statusId) => bulk(ids, { statusId }, `Status alterado em ${ids.length} ${ids.length === 1 ? 'ticket' : 'tickets'}`),
    setPriority: (ids, priority) => bulk(ids, { priority }, `Prioridade alterada em ${ids.length} ${ids.length === 1 ? 'ticket' : 'tickets'}`),

    deleteTickets: async (ids) => {
      try {
        await api.deleteTickets(ids);
        recompute(get().tickets.filter((t) => !ids.includes(t.id)));
        toast.success(ids.length === 1 ? `Ticket #${ids[0]} apagado` : `${ids.length} tickets apagados`);
        return true;
      } catch {
        toast.error('Não foi possível apagar os tickets.');
        return false;
      }
    },

    mergeTickets: async (targetId, sourceIds) => {
      try {
        const { target, sources } = await api.mergeTickets(targetId, sourceIds);
        upsert([target, ...sources]);
        toast.success(`Tickets mesclados no #${targetId}`);
        return true;
      } catch {
        toast.error('Não foi possível mesclar os tickets.');
        return false;
      }
    },
  };
});

/** Um passo da simulação de tempo quase real: novo ticket ou resposta de cliente. Exportado para testes. */
export function liveTick(random: () => number = Math.random): void {
  const state = useTickets.getState();
  if (!state.loaded) return;
  const reply = random() < 0.5 ? api.simulateCustomerReply() : null;
  if (reply) {
    useTickets.setState({
      tickets: state.tickets.map((t) => (t.id === reply.id ? reply : t)),
    });
    useTickets.setState((s) => ({ counts: countViews(s.views, s.tickets, ctx(s.statuses)) }));
    toast.info(`Nova resposta no ticket #${reply.id}`, { description: reply.subject });
    return;
  }
  const created = api.simulateIncomingTicket();
  useTickets.setState((s) => {
    const tickets = [...s.tickets, created];
    return { tickets, counts: countViews(s.views, tickets, ctx(s.statuses)) };
  });
  toast.info(`Novo ticket #${created.id}`, { description: created.subject });
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startLiveUpdates(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => liveTick(), intervalMs);
}

export function stopLiveUpdates(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
