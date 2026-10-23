import { create } from 'zustand';
import * as api from '@/api/tickets';
import { IS_REAL } from '@/api/mode';
import { listStatuses, saveStatus as saveStatusApi } from '@/api/meta';
import { countViews } from '@/lib/views';
import { runView as runViewPure } from '@/lib/views';
import { getMeId } from './useSession';
import { useRefData } from './useRefData';
import type { AuditEvent, Priority, Ticket, TicketStatus, View } from '@/types/domain';
import { localSaved, toast } from './useUi';

const seedViews: View[] = api.initialViews;

export type ViewCounts = Record<string, number | null>;

function nullCounts(views: View[]): ViewCounts {
  return Object.fromEntries(views.map((v) => [v.countKey, null]));
}

/**
 * Contadores: os do SERVIDOR (modo real) valem; o que ele não informa sai da avaliação local sobre os tickets
 * carregados (visões do Helpdesk sem equivalente exato); visões avaliadas no servidor sem contador ficam `null`.
 */
export function mergeCounts(views: View[], tickets: Ticket[], c: { meId: string; now: Date; statuses: TicketStatus[] }, server: Record<string, number>): ViewCounts {
  const out: ViewCounts = {};
  const local = countViews(
    views.filter((v) => !v.query),
    tickets,
    c,
  );
  for (const v of views) out[v.countKey] = server[v.countKey] ?? (v.query ? null : (local[v.countKey] ?? null));
  return out;
}

/** Recarga da lista: o que já tinha mensagens/eventos (detalhe aberto) não os perde para a versão enxuta da lista. */
export function keepDetails(prev: Ticket[], next: Ticket[]): Ticket[] {
  const byId = new Map(prev.filter((t) => t.detailed).map((t) => [t.id, t]));
  return next.map((t) => {
    const d = byId.get(t.id);
    return d && t.detailed === false ? { ...t, comments: d.comments, events: d.events, followerIds: d.followerIds, requesterId: t.requesterId || d.requesterId, detailed: true } : t;
  });
}

/** Pedido de fechamento em lote: os tickets que de fato fecham e os que já estavam fechados (ignorados). */
export interface BulkCloseRequest {
  statusId: string;
  ids: number[];
  skippedIds: number[];
  onDone?: () => void;
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
  /** Só modo real: ids (na ordem do servidor) das visões avaliadas NO SERVIDOR (`view.query`), por id de visão. */
  viewIds: Record<string, number[]>;
  /** Só modo real: paginação por visão do servidor (total no servidor, quantos já vieram, se há mais). */
  viewMeta: Record<string, { total: number; loaded: number; hasMore: boolean }>;

  load: () => Promise<void>;
  /**
   * Modo real: traz do servidor TODOS os tickets de um cliente (`?requester=`) ou organização (`?company=`) e os junta à
   * store, para o histórico não depender dos 100 primeiros da lista inicial. No mock a store já tem tudo (não faz nada).
   */
  loadRelated: (filter: { requesterId?: string; orgId?: string }) => Promise<void>;
  /** Só modo real: carrega do servidor a lista de uma visão com `query` (visões do sistema extras e pessoais). */
  loadView: (viewId: string, opts?: { limit?: number }) => Promise<void>;
  loadMoreView: (viewId: string) => Promise<void>;
  reloadViews: () => Promise<void>;
  createPersonalView: (name: string, filters?: Record<string, string>) => Promise<View | null>;
  updatePersonalView: (viewId: string, name: string, filters?: Record<string, string>, opts?: { silent?: boolean }) => Promise<View | null>;
  deletePersonalView: (viewId: string) => Promise<boolean>;
  /** Só modo real: traz mensagens e eventos do ticket (a lista do backend não os inclui). */
  loadDetail: (id: number) => Promise<Ticket>;
  /** Só os status (telas de administração abertas sem passar pelas listas). */
  loadStatuses: () => Promise<void>;
  /** Cria/edita/desativa um status e publica o resultado para todas as telas na hora. */
  saveStatus: (status: Omit<TicketStatus, 'id'> & { id?: string }) => Promise<TicketStatus>;
  /** Zera os contadores (null) e busca de novo. `quiet` mantém os valores atuais até chegarem os novos. */
  refreshCounts: (quiet?: boolean) => Promise<void>;
  /** Publica na store um ticket já gravado no servidor (resultado parcial de um envio) sem toast. */
  applyServerTicket: (ticket: Ticket) => void;
  /** Tickets de uma view, avaliados sobre o estado atual da store. */
  ticketsForView: (viewId: string) => Ticket[];
  /** `silent: true` não dispara o toast padrão (quem chama mostra o próprio). */
  updateTicket: (id: number, patch: api.TicketPatch, comment?: api.NewComment, opts?: { silent?: boolean; macroIds?: string[]; resolutionWindow?: { started: string; ended: string } }) => Promise<Ticket>;
  createTicket: (input: api.NewTicketInput, opts?: { silent?: boolean }) => Promise<Ticket>;
  /** Grava o resultado do motor de gatilhos (patch + eventos) e atualiza a store, sem toast. */
  applyAutomation: (id: number, patch: api.TicketPatch, events: AuditEvent[]) => Promise<Ticket>;
  /** Ação em lote (servidor no modo real). `true` só se TODOS foram alterados; as falhas por ticket vão em toast. */
  assignToMe: (ids: number[]) => Promise<boolean>;
  setStatus: (ids: number[], statusId: string) => Promise<boolean>;
  /** Fechamento em lote aguardando a confirmação no diálogo (`null` = nenhum). */
  bulkClose: BulkCloseRequest | null;
  /**
   * Muda o status de vários tickets. Se o destino é uma categoria resolvida, abre o diálogo de confirmação do lote
   * (janela de cada ticket) em vez de gravar direto; `onDone` roda quando TODOS foram alterados.
   */
  requestSetStatus: (ids: number[], statusId: string, onDone?: () => void) => Promise<void>;
  cancelBulkClose: () => void;
  /** Confirma o lote com as janelas aprovadas: devolve o que fechou e as falhas por ticket (o diálogo as mostra). */
  submitBulkClose: (resolutions: api.BulkResolution[]) => Promise<{ updated: number; failed: { id: number; message: string }[] }>;
  setPriority: (ids: number[], priority: Priority) => Promise<boolean>;
  deleteTickets: (ids: number[]) => Promise<boolean>;
  mergeTickets: (targetId: number, sourceIds: number[]) => Promise<boolean>;
}

function ctx(statuses: TicketStatus[]) {
  return { meId: getMeId(), now: new Date(), statuses };
}

const FIELD_LABEL: Record<string, string> = { subject: 'assunto', requesterId: 'solicitante', type: 'tipo', ccIds: 'CC', customFields: 'campos personalizados', followerIds: 'seguidores' };

/** Modo real: campos da edição que o backend não tem avisam "somente neste navegador" (e só eles). */
export function localFieldsNote(t: Ticket): string {
  if (!IS_REAL || !t.localFields?.length) return '';
  return ` (${t.localFields.map((k) => FIELD_LABEL[k] ?? k).join(', ')}: somente neste navegador)`;
}

/** Históricos (cliente/organização) em carregamento: pedidos iguais compartilham a chamada. */
const relatedLoads = new Map<string, Promise<void>>();

/** Visões do servidor em carregamento (evita pedido duplicado). */
const viewLoads = new Set<string>();

export const useTickets = create<TicketsState>()((set, get) => {
  const recompute = (tickets: Ticket[]) => {
    const { views, statuses } = get();
    // Modo real: os contadores vêm do servidor (alterações locais não mudam o backend, então não os mudam).
    set(IS_REAL ? { tickets } : { tickets, counts: countViews(views, tickets, ctx(statuses)) });
  };
  const upsert = (list: Ticket[]) => {
    const prev = new Map(get().tickets.map((t) => [t.id, t]));
    // Versão enxuta da lista não apaga mensagens/eventos que a tela já carregou.
    keepDetails([...prev.values()], list).forEach((t) => prev.set(t.id, t));
    recompute([...prev.values()].sort((a, b) => a.id - b.id));
  };
  /** Modo real: depois de qualquer escrita os contadores do servidor mudaram. */
  const afterWrite = () => {
    if (IS_REAL) void get().refreshCounts(true);
  };
  /** Executa a ação em lote e aplica o resultado na store. Devolve o resultado, ou o erro se a chamada toda falhou. */
  const runBulk = async (ids: number[], change: api.BulkChange): Promise<{ result: api.BulkResult } | { error: string }> => {
    try {
      const result = await api.bulkUpdate(ids, change);
      upsert(result.updated);
      afterWrite();
      return { result };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Não foi possível concluir o fechamento. Tente novamente.' };
    }
  };
  const bulk = async (ids: number[], change: api.BulkChange, okMessage: string): Promise<boolean> => {
    let result: api.BulkResult;
    try {
      result = await api.bulkUpdate(ids, change);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir a ação em lote.', {
        action: { label: 'Tentar novamente', onClick: () => void bulk(ids, change, okMessage) },
      });
      return false;
    }
    upsert(result.updated);
    afterWrite();
    if (result.failed.length === 0) {
      toast.success(okMessage);
      return true;
    }
    const failedIds = result.failed.map((f) => f.id);
    const first = result.failed[0]!;
    toast.error(
      result.updated.length > 0
        ? `${result.updated.length} de ${ids.length} tickets alterados. Não alterados: ${failedIds.map((id) => `#${id}`).join(', ')}. ${first.message}`
        : `Nenhum ticket foi alterado. ${first.message}`,
      { action: { label: 'Tentar novamente', onClick: () => void bulk(failedIds, change, okMessage) } },
    );
    return false;
  };

  return {
    tickets: [],
    statuses: [],
    views: seedViews,
    counts: nullCounts(seedViews),
    loaded: false,
    loading: false,
    error: null,
    viewIds: {},
    viewMeta: {},
    bulkClose: null,

    load: async () => {
      set({ loading: true, error: null });
      try {
        const [tickets, statuses, views, counts] = await Promise.all([
          api.listTickets(),
          listStatuses(),
          api.listViews(),
          api.getViewCounts(),
        ]);
        set({
          tickets: keepDetails(get().tickets, tickets),
          statuses,
          views,
          counts: mergeCounts(views, tickets, ctx(statuses), counts),
          viewIds: {},
          viewMeta: {},
          loaded: true,
          loading: false,
        });
        void useRefData.getState().refresh();
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : 'Erro ao carregar tickets.' });
      }
    },

    loadStatuses: async () => {
      const statuses = await listStatuses();
      set({ statuses: [...statuses] });
    },

    saveStatus: async (status) => {
      const saved = await saveStatusApi(status);
      const statuses = get().statuses;
      const next = statuses.some((s) => s.id === saved.id) ? statuses.map((s) => (s.id === saved.id ? saved : s)) : [...statuses, saved];
      set({ statuses: next });
      recompute(get().tickets);
      return saved;
    },

    applyServerTicket: (ticket) => {
      upsert([ticket]);
      afterWrite();
    },

    refreshCounts: async (quiet) => {
      if (!quiet) set({ counts: nullCounts(get().views) });
      const { views, tickets, statuses } = get();
      set({ counts: mergeCounts(views, tickets, ctx(statuses), await api.getViewCounts()) });
    },

    loadRelated: async (filter) => {
      if (!IS_REAL) return;
      // Pedidos iguais em voo (StrictMode, painel + perfil abertos) compartilham a mesma chamada.
      const key = `${filter.requesterId ?? ''}|${filter.orgId ?? ''}`;
      const running = relatedLoads.get(key);
      if (running) return running;
      const promise = api
        .listTickets(filter)
        .then((list) => upsert(list))
        .finally(() => relatedLoads.delete(key));
      relatedLoads.set(key, promise);
      return promise;
    },

    loadView: async (viewId, opts) => {
      if (viewLoads.has(viewId)) return;
      viewLoads.add(viewId);
      try {
        const list = await api.runView(viewId, { offset: 0, limit: opts?.limit });
        upsert(list.map((t) => get().tickets.find((x) => x.id === t.id && x.detailed && !t.detailed) ?? t));
        const meta = api.viewPageMeta[viewId];
        set((s) => ({
          viewIds: { ...s.viewIds, [viewId]: list.map((t) => t.id) },
          viewMeta: {
            ...s.viewMeta,
            [viewId]: meta
              ? { total: meta.total, loaded: meta.loaded, hasMore: meta.hasMore }
              : { total: list.length, loaded: list.length, hasMore: false },
          },
        }));
      } catch (e) {
        set((s) => ({ viewIds: { ...s.viewIds, [viewId]: [] }, viewMeta: { ...s.viewMeta, [viewId]: { total: 0, loaded: 0, hasMore: false } } }));
        toast.error(e instanceof Error ? e.message : 'Não foi possível carregar a visualização.');
      } finally {
        viewLoads.delete(viewId);
      }
    },

    loadMoreView: async (viewId) => {
      if (viewLoads.has(viewId)) return;
      const meta = get().viewMeta[viewId];
      if (!meta?.hasMore) return;
      viewLoads.add(viewId);
      try {
        const offset = get().viewIds[viewId]?.length ?? 0;
        const list = await api.runView(viewId, { offset });
        upsert(list.map((t) => get().tickets.find((x) => x.id === t.id && x.detailed && !t.detailed) ?? t));
        const next = api.viewPageMeta[viewId];
        set((s) => {
          const prevIds = s.viewIds[viewId] ?? [];
          const seen = new Set(prevIds);
          const added = list.map((t) => t.id).filter((id) => !seen.has(id));
          return {
            viewIds: { ...s.viewIds, [viewId]: [...prevIds, ...added] },
            viewMeta: {
              ...s.viewMeta,
              [viewId]: next
                ? { total: next.total, loaded: prevIds.length + added.length, hasMore: next.hasMore }
                : { total: prevIds.length + added.length, loaded: prevIds.length + added.length, hasMore: false },
            },
          };
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível carregar mais tickets.');
      } finally {
        viewLoads.delete(viewId);
      }
    },


    reloadViews: async () => {
      const views = await api.listViews();
      const counts = await api.getViewCounts();
      set((s) => ({
        views,
        counts: mergeCounts(views, s.tickets, ctx(s.statuses), counts),
      }));
    },

    createPersonalView: async (name, filters) => {
      try {
        const view = await api.createPersonalView({ name, filters });
        await get().reloadViews();
        toast.success(`Visualização “${view.name}” criada`);
        return view;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível criar a visualização.');
        return null;
      }
    },

    updatePersonalView: async (viewId, name, filters, opts) => {
      try {
        const view = await api.updatePersonalView(viewId, { name, filters });
        await get().reloadViews();
        // A query do servidor mudou: a lista acumulada (e o offset do "Carregar mais") deixou de valer. Sem ids, a
        // tela da visão busca a 1ª página de novo.
        set((s) => {
          const { [viewId]: _ids, ...viewIds } = s.viewIds;
          const { [viewId]: _meta, ...viewMeta } = s.viewMeta;
          return { viewIds, viewMeta };
        });
        delete api.viewPageMeta[viewId];
        if (!opts?.silent) toast.success(`Visualização “${view.name}” atualizada`);
        return view;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar a visualização.');
        return null;
      }
    },

    deletePersonalView: async (viewId) => {
      try {
        await api.deletePersonalView(viewId);
        set((s) => {
          const { [viewId]: _ids, ...viewIds } = s.viewIds;
          const { [viewId]: _meta, ...viewMeta } = s.viewMeta;
          return {
            views: s.views.filter((v) => v.id !== viewId),
            viewIds,
            viewMeta,
          };
        });
        void get().refreshCounts(true);
        toast.success('Visualização apagada');
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível apagar a visualização.');
        return false;
      }
    },

    loadDetail: async (id) => {
      const t = await api.getTicket(id);
      upsert([t]);
      return t;
    },

    ticketsForView: (viewId) => {
      const { views, tickets, statuses } = get();
      const view = views.find((v) => v.id === viewId);
      if (view?.query) {
        const ids = get().viewIds[viewId];
        const byId = new Map(tickets.map((t) => [t.id, t]));
        return (ids ?? []).map((id) => byId.get(id)).filter((t): t is Ticket => Boolean(t));
      }
      return view ? runViewPure(view, tickets, ctx(statuses)) : [];
    },

    updateTicket: async (id, patch, comment, opts) => {
      const updated = await api.updateTicket(id, patch, comment, { macroIds: opts?.macroIds, resolutionWindow: opts?.resolutionWindow });
      upsert([updated]);
      afterWrite();
      if (!opts?.silent) toast.success(`Ticket #${id} foi atualizado${localFieldsNote(updated)}`);
      return updated;
    },

    createTicket: async (input, opts) => {
      const created = await api.createTicket(input);
      upsert([created]);
      afterWrite();
      if (!opts?.silent) toast.success(`Ticket #${created.id} foi criado${localFieldsNote(created)}`);
      return created;
    },

    applyAutomation: async (id, patch, events) => {
      const updated = await api.applyAutomation(id, patch, events);
      upsert([updated]);
      return updated;
    },

    assignToMe: (ids) => bulk(ids, { assigneeId: getMeId() }, ids.length === 1 ? `Ticket #${ids[0]} atribuído a você` : `${ids.length} tickets atribuídos a você`),
    setStatus: (ids, statusId) => bulk(ids, { statusId }, `Status alterado em ${ids.length} ${ids.length === 1 ? 'ticket' : 'tickets'}`),
    requestSetStatus: async (ids, statusId, onDone) => {
      const { statuses, tickets } = get();
      const target = statuses.find((s) => s.id === statusId);
      if (target?.category !== 'solved') {
        if (await get().setStatus(ids, statusId)) onDone?.();
        return;
      }
      // Fechar pede a janela da solução: tickets já fechados não entram (o backend os recusaria).
      const closedIds = new Set(tickets.filter((t) => ids.includes(t.id) && statuses.find((s) => s.id === t.statusId)?.category === 'solved').map((t) => t.id));
      const todo = ids.filter((id) => !closedIds.has(id));
      if (todo.length === 0) {
        toast.info(ids.length === 1 ? 'O ticket já está fechado.' : 'Os tickets selecionados já estão fechados.');
        onDone?.();
        return;
      }
      set({ bulkClose: { statusId, ids: todo, skippedIds: ids.filter((id) => closedIds.has(id)), onDone } });
    },

    cancelBulkClose: () => set({ bulkClose: null }),

    submitBulkClose: async (resolutions) => {
      const req = get().bulkClose;
      if (!req) return { updated: 0, failed: [] };
      const ids = resolutions.map((r) => r.id);
      const outcome = await runBulk(ids, { statusId: req.statusId, resolutions });
      if ('error' in outcome) return { updated: 0, failed: ids.map((id) => ({ id, message: outcome.error })) };
      const { result } = outcome;
      if (result.updated.length > 0) toast.success(result.updated.length === 1 ? 'Ticket fechado' : `${result.updated.length} tickets fechados`);
      if (result.failed.length === 0) {
        set({ bulkClose: null });
        req.onDone?.();
      } else {
        // O diálogo fica aberto só com os que falharam (e o motivo de cada um).
        set({ bulkClose: { ...req, ids: result.failed.map((f) => f.id) } });
      }
      return { updated: result.updated.length, failed: result.failed };
    },

    setPriority: (ids, priority) => bulk(ids, { priority }, `Prioridade alterada em ${ids.length} ${ids.length === 1 ? 'ticket' : 'tickets'}`),

    deleteTickets: async (ids) => {
      try {
        await api.deleteTickets(ids);
        recompute(get().tickets.filter((t) => !ids.includes(t.id)));
        toast.success(localSaved(ids.length === 1 ? `Ticket #${ids[0]} apagado` : `${ids.length} tickets apagados`, 'deleteTicket'));
        return true;
      } catch {
        toast.error('Não foi possível apagar os tickets.', { action: { label: 'Tentar novamente', onClick: () => void get().deleteTickets(ids) } });
        return false;
      }
    },

    mergeTickets: async (targetId, sourceIds) => {
      try {
        const { target, sources } = await api.mergeTickets(targetId, sourceIds);
        upsert([target, ...sources]);
        toast.success(localSaved(`Tickets mesclados no #${targetId}`, 'merge'));
        return true;
      } catch {
        toast.error('Não foi possível mesclar os tickets.', { action: { label: 'Tentar novamente', onClick: () => void get().mergeTickets(targetId, sourceIds) } });
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
let wsStarted = false;

let viewsReload: ReturnType<typeof setTimeout> | undefined;

/**
 * Listas por visão (modo real) guardam só ids; um evento do servidor pode tirar um ticket da visão ou pôr outro nela.
 * Rebusca as visões já abertas mantendo o tamanho acumulado (páginas do "Carregar mais" não se perdem).
 */
function reloadOpenViews(): void {
  if (viewsReload) clearTimeout(viewsReload);
  viewsReload = setTimeout(() => {
    viewsReload = undefined;
    const { viewIds, viewMeta } = useTickets.getState();
    for (const viewId of Object.keys(viewIds)) {
      const keep = Math.min(500, Math.max(100, viewMeta[viewId]?.loaded ?? viewIds[viewId]?.length ?? 0));
      void useTickets.getState().loadView(viewId, { limit: keep });
    }
  }, 800);
}

/** Debounce de revalidação por ticket (vários eventos no mesmo segundo). */
const pendingRefresh = new Map<number, ReturnType<typeof setTimeout>>();

async function refreshTicketFromServer(ticketId: number, kind?: string): Promise<void> {
  try {
    const ticket = await api.getTicket(ticketId);
    useTickets.getState().applyServerTicket(ticket);
    void useTickets.getState().refreshCounts(true);
    void reloadOpenViews();
    // `kind` vem do backend (broadcast_ticket_event): assigned | owner | updated | closed | reply.
    if (kind === 'reply' || kind === 'assigned') {
      toast.info(kind === 'assigned' ? `Ticket #${ticketId} atribuído a você` : `Nova resposta no ticket #${ticketId}`, {
        description: ticket.subject,
      });
    }
  } catch {
    // Sem rede / 404: ignora; a próxima abertura do ticket ou o load geral corrige.
  }
}

function scheduleTicketRefresh(ticketId: number, kind?: string): void {
  const prev = pendingRefresh.get(ticketId);
  if (prev) clearTimeout(prev);
  pendingRefresh.set(
    ticketId,
    setTimeout(() => {
      pendingRefresh.delete(ticketId);
      void refreshTicketFromServer(ticketId, kind);
    }, 300),
  );
}

function startRealLiveUpdates(): void {
  if (wsStarted) return;
  wsStarted = true;
  // Import estático evitado nos testes mock: carrega só em runtime real.
  void import('@/api/real/ws').then(({ getMeSocket }) => {
    const sock = getMeSocket();
    let opened = false;
    sock.setHandlers({
      // Reconexão: eventos perdidos durante a queda não voltam; revalida os contadores (REST é a verdade).
      onOpen: () => {
        if (opened) void useTickets.getState().refreshCounts(true);
        opened = true;
      },
      onTicketEvent: (ev) => scheduleTicketRefresh(ev.ticket_id, ev.kind),
      onNotification: (ev) => {
        const title = ev.title || (ev.kind === 'chat_message' ? 'Nova mensagem de chat' : 'Notificação');
        const description = ev.body || ev.preview || undefined;
        toast.info(title, description ? { description: String(description) } : undefined);
        if (typeof ev.ticket_id === 'number') scheduleTicketRefresh(ev.ticket_id, ev.kind);
      },
    });
    sock.start();
  });
}

function stopRealLiveUpdates(): void {
  if (!wsStarted) return;
  wsStarted = false;
  for (const t of pendingRefresh.values()) clearTimeout(t);
  pendingRefresh.clear();
  if (viewsReload) clearTimeout(viewsReload);
  viewsReload = undefined;
  void import('@/api/real/ws').then(({ stopMeSocket }) => stopMeSocket());
}

/** Mock: intervalo simulando chegada. Real: WebSocket `/ws/me/`. */
export function startLiveUpdates(intervalMs = 60_000): void {
  if (IS_REAL) {
    startRealLiveUpdates();
    return;
  }
  if (timer) return;
  timer = setInterval(() => liveTick(), intervalMs);
}

export function stopLiveUpdates(): void {
  if (IS_REAL) {
    stopRealLiveUpdates();
    return;
  }
  if (timer) clearInterval(timer);
  timer = undefined;
}
