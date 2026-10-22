import { runView as runViewPure } from '@/lib/views';
import type { Ticket, View } from '@/types/domain';
import { ApiError, PartialUpdateError } from '../errors';
import * as mock from '../mock/tickets';
import type { BulkChange, BulkResult, NewTicketInput, TicketFilter, TicketPatch } from '../mock/tickets';
import { getRealMeId } from './auth';
import { http, type Paginated } from './http';
import { layers, mirror, upsertInDb, withLocalTicketFields } from './local';
import { HELPDESK_VIEWS, SYSTEM_EXTRA_VIEWS, countsFromSummary, mapPersonalView, mapTicketDetail, mapTicketListItem, matchRequesterId, personalViewId, type PersonalViewDto, type SummaryDto, type TicketDetailDto, type TicketDto, type ViewDef } from './mappers';
import { getClients, getGroups, getOrgs, getStaff, getStatuses, getTags, memo } from './refs';
import { ensureTags } from './tags';
import { LOCAL_ONLY_KEYS, labelOf, createTicketBody, planTicketUpdate, resolutionWindow, toFormData, type PlanStep, type ResolutionWindow, type TicketPlan } from './mappers/outbound';
import { htmlToMarkdown } from './mappers/htmlToMarkdown';
import { resolveStatusId } from './mappers/status';
import { statusIdByCategory } from '@/lib/status';
import { db } from '../mock/db';

/**
 * TICKETS (leitura real).
 *
 * Estratégia (paginação por visão):
 * - Carga inicial (`loadAll`): só a 1ª página da lista global (HOME_PAGE), não milhares de tickets.
 * - Visões com `query` (Helpdesk com par no servidor, sistema e pessoais): `runView` busca página a página
 *   (VIEW_PAGE) e a store acumula ids em `viewIds`; "Carregar mais" pede o próximo offset.
 * - Visões só locais (`recent`, `solved-recent`): avaliam `conditions` sobre o que já está na store.
 * - Contadores vêm do servidor (`/tickets/resumo/` + counts).
 *
 * A lista do backend não traz `requester_id`/`company_id`: o solicitante é resolvido por casamento único de
 * nome+empresa com o diretório de clientes (0 chamadas extras) e, onde há homônimos, pelo detalhe do ticket
 * (`GET /tickets/{id}/`, cacheado por ticket, 6 em paralelo).
 */

/** Página da lista global no boot (Home / Clientes / Orgs usam o que couber aqui + o que as visões trouxerem). */
export const HOME_PAGE = 100;
/** Página ao abrir / paginar uma visão do servidor. */
export const VIEW_PAGE = 100;
/** Teto absoluto se algo ainda pedir "carregar tudo" (legado). */
export const MAX_TICKETS = 5000;
const DETAIL_CONCURRENCY = 6;

export interface TicketsLoadInfo {
  total: number;
  loaded: number;
  truncated: boolean;
  /** Chamadas ao detalhe só para descobrir o solicitante (homônimos / diretório indisponível). */
  requesterLookups: number;
}
export const loadInfo: TicketsLoadInfo = { total: 0, loaded: 0, truncated: false, requesterLookups: 0 };

const requesterByTicket = new Map<number, string>();

/** Uma página de tickets (não varre o restante). */
export async function fetchTicketPage(
  query: Record<string, string | number> = {},
  opts: { limit?: number; offset?: number } = {},
): Promise<{ dtos: TicketDto[]; total: number; offset: number; limit: number; hasMore: boolean }> {
  const limit = opts.limit ?? VIEW_PAGE;
  const offset = opts.offset ?? 0;
  const page = await http.get<Paginated<TicketDto>>('/tickets/', { limit, offset, ...query });
  const dtos = [...page.results];
  const total = page.count;
  return { dtos, total, offset, limit, hasMore: offset + dtos.length < total };
}

/** Legado: várias páginas em paralelo até `max` (default = HOME_PAGE — só a 1ª). */
async function fetchTicketDtos(
  query: Record<string, string | number> = {},
  opts: { pageSize?: number; max?: number } = {},
): Promise<{ dtos: TicketDto[]; total: number }> {
  const pageSize = opts.pageSize ?? HOME_PAGE;
  const max = opts.max ?? HOME_PAGE;
  const first = await fetchTicketPage(query, { limit: pageSize, offset: 0 });
  const dtos = [...first.dtos];
  const wanted = Math.min(first.total, max);
  const offsets: number[] = [];
  for (let o = pageSize; o < wanted; o += pageSize) offsets.push(o);
  if (offsets.length > 0) {
    const rest = await Promise.all(offsets.map((offset) => fetchTicketPage(query, { limit: pageSize, offset })));
    rest.forEach((p) => dtos.push(...p.dtos));
  }
  return { dtos, total: first.total };
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

/** DTOs da lista -> Ticket[] (com o solicitante resolvido). */
async function toTickets(dtos: TicketDto[]): Promise<Ticket[]> {
  const [statuses, clients, orgs] = await Promise.all([getStatuses(), getClients().catch(() => []), getOrgs().catch(() => [])]);
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]));
  const resolved = new Map<number, string>();
  const lookups: TicketDto[] = [];
  for (const dto of dtos) {
    const id = requesterByTicket.get(dto.id) ?? matchRequesterId(dto, clients, (orgId) => (orgId ? orgNames.get(orgId) : undefined));
    if (id) resolved.set(dto.id, id);
    else if (!dto.content_hidden) lookups.push(dto);
  }
  await pool(lookups, DETAIL_CONCURRENCY, async (dto) => {
    try {
      const detail = await http.get<TicketDetailDto>(`/tickets/${dto.id}/`);
      loadInfo.requesterLookups += 1;
      if (detail.requester) {
        requesterByTicket.set(dto.id, String(detail.requester.id));
        resolved.set(dto.id, String(detail.requester.id));
      }
    } catch {
      /* fica sem solicitante: a tela mostra o nome vindo da lista */
    }
  });
  return dtos.map((dto) => {
    const requesterId = resolved.get(dto.id);
    return withLocalTicketFields(mapTicketListItem(dto, { statuses, requesterId: requesterId ? (layers.mergedUsers.get(requesterId) ?? requesterId) : undefined }));
  });
}

export const loadAll = memo<Ticket[]>(async () => {
  // Só a 1ª página global: o volume completo vem por visão (`runView` / `loadMoreView`).
  const { dtos, total } = await fetchTicketDtos({}, { pageSize: HOME_PAGE, max: HOME_PAGE });
  Object.assign(loadInfo, { total, loaded: dtos.length, truncated: total > dtos.length });
  if (loadInfo.truncated) {
    console.info(`Helpdesk: ${total} tickets no backend; lista inicial com ${dtos.length}. Abra uma visualização para paginar o resto.`);
  }
  return toTickets(dtos);
}, 10_000);

/** Todos os tickets (leitura real + alterações locais ainda não enviadas), espelhados no banco do mock para as escritas locais. */
async function allTickets(): Promise<Ticket[]> {
  const merged = layers.tickets.apply(await loadAll());
  mirror.tickets(merged);
  return merged;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function listTickets(filter: TicketFilter = {}): Promise<Ticket[]> {
  const all = await allTickets();
  const q = filter.query ? fold(filter.query) : '';
  return all.filter(
    (t) =>
      (!filter.statusIds || filter.statusIds.includes(t.statusId)) &&
      (!filter.channel || t.channel === filter.channel) &&
      (!filter.requesterId || t.requesterId === filter.requesterId) &&
      (!filter.assigneeId || t.assigneeId === filter.assigneeId) &&
      (!q || fold(t.subject).includes(q) || fold(t.reference ?? '').includes(q)),
  );
}

const detailInflight = new Map<number, Promise<Ticket>>();

/** Detalhe do ticket; pedidos simultâneos do mesmo ticket (aba, tela, StrictMode) compartilham a mesma chamada. */
export function getTicket(id: number): Promise<Ticket> {
  const local = layers.tickets.get(id);
  if (local && local.detailed !== false) return Promise.resolve(local);
  const running = detailInflight.get(id);
  if (running) return running;
  const promise = fetchDetail(id, local).finally(() => detailInflight.delete(id));
  detailInflight.set(id, promise);
  return promise;
}

async function fetchDetail(id: number, local: Ticket | undefined): Promise<Ticket> {
  const [dto, statuses, staff, clients] = await Promise.all([http.get<TicketDetailDto>(`/tickets/${id}/`), getStatuses(), getStaff().catch(() => []), getClients().catch(() => [])]);
  const known = requesterByTicket.get(id);
  const ticket = withLocalTicketFields(mapTicketDetail(dto, { statuses, staff, clients, requesterId: known }));
  if (dto.requester) requesterByTicket.set(id, String(dto.requester.id));
  return local ? { ...ticket, ...local, comments: ticket.comments, events: ticket.events, detailed: true } : ticket;
}

// ---------------------------------------------------------------------------------------------------------------
// Visões
// ---------------------------------------------------------------------------------------------------------------

const defs = (): ViewDef[] => [...HELPDESK_VIEWS, ...SYSTEM_EXTRA_VIEWS];

export const initialViews: View[] = HELPDESK_VIEWS.map((d) => d.view);

// Cache de 5 s: a lista de visões é pedida junto dos contadores e ao abrir cada visão (e o StrictMode repete efeitos).
const personalViews = memo<PersonalViewDto[]>(async () => {
  try {
    const res = await http.get<PersonalViewDto[] | Paginated<PersonalViewDto>>('/ticket-views/');
    return Array.isArray(res) ? res : res.results;
  } catch {
    return [];
  }
}, 5_000);

export function viewContext(now: Date = new Date()) {
  return { meId: getRealMeId(), now, statuses: db.statuses };
}

export async function listViews(): Promise<View[]> {
  const personal = await personalViews();
  return [...HELPDESK_VIEWS.map((d) => d.view), ...personal.map(mapPersonalView), ...SYSTEM_EXTRA_VIEWS.map((d) => d.view)];
}

/**
 * Contadores do SERVIDOR (`/tickets/resumo/` + `count` das visões pessoais + um GET de 1 item para "pendentes").
 * As visões sem equivalente exato (recentes, resolvidos recentes) ficam fora: a store as completa pela avaliação local.
 * Nunca falha (o que não responder simplesmente não vem).
 */
export async function getViewCounts(): Promise<Record<string, number>> {
  const [summary, personal] = await Promise.all([http.get<SummaryDto>('/tickets/resumo/').catch(() => null), personalViews()]);
  const counts = countsFromSummary(defs(), summary, personal);
  await Promise.all(
    defs()
      .filter((d) => d.serverCount?.query)
      .map(async (d) => {
        try {
          const res = await http.get<Paginated<TicketDto>>('/tickets/', { limit: 1, ...d.serverCount!.query });
          counts[d.view.countKey] = res.count;
        } catch {
          /* sem contador */
        }
      }),
  );
  return counts;
}

/** Meta da última página carregada por visão (modo real). */
export interface ViewPageMeta {
  total: number;
  loaded: number;
  hasMore: boolean;
  offset: number;
}

export const viewPageMeta: Record<string, ViewPageMeta> = {};

/**
 * Lista de uma visão. Com `query`, busca no servidor uma página (`offset`/`limit`).
 * Sem `query`, avalia localmente sobre os tickets já carregados.
 */
export async function runView(viewId: string, opts: { offset?: number; limit?: number } = {}): Promise<Ticket[]> {
  const view = (await listViews()).find((v) => v.id === viewId);
  if (!view) throw new ApiError('Visualização não encontrada.');
  if (view.query) {
    const limit = opts.limit ?? VIEW_PAGE;
    const offset = opts.offset ?? 0;
    const page = await fetchTicketPage(view.query, { limit, offset });
    viewPageMeta[viewId] = {
      total: page.total,
      loaded: offset + page.dtos.length,
      hasMore: page.hasMore,
      offset,
    };
    const fromServer = await toTickets(page.dtos);
    const local = new Map(layers.tickets.apply(fromServer).map((t) => [t.id, t]));
    return fromServer.map((t) => local.get(t.id) ?? t);
  }
  const all = await allTickets();
  const list = runViewPure(view, all, { meId: getRealMeId(), now: new Date(), statuses: await getStatuses() });
  viewPageMeta[viewId] = { total: list.length, loaded: list.length, hasMore: false, offset: 0 };
  return list;
}


export { personalViewId };

/** Converte filtros da UI para o mapa plano que o backend guarda em `SavedTicketView.filters`. */
export function filtersToServer(filters: {
  priority?: string;
  status?: string;
  q?: string;
  tags?: string;
  [k: string]: string | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== 'any') out[k] = v;
  }
  return out;
}

export async function createPersonalView(input: { name: string; filters?: Record<string, string> }): Promise<View> {
  const dto = await http.post<PersonalViewDto>('/ticket-views/', {
    name: input.name.trim().slice(0, 60),
    filters: input.filters ?? {},
  });
  personalViews.reset();
  return mapPersonalView(dto);
}

export async function updatePersonalView(
  viewId: string,
  input: { name?: string; filters?: Record<string, string> },
): Promise<View> {
  const id = personalViewId(viewId);
  if (id == null) throw new ApiError('Só visualizações pessoais podem ser editadas no servidor.');
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name.trim().slice(0, 60);
  if (input.filters !== undefined) body.filters = input.filters;
  const dto = await http.patch<PersonalViewDto>(`/ticket-views/${id}/`, body);
  personalViews.reset();
  return mapPersonalView(dto);
}

export async function deletePersonalView(viewId: string): Promise<void> {
  const id = personalViewId(viewId);
  if (id == null) throw new ApiError('Só visualizações pessoais podem ser apagadas no servidor.');
  await http.delete(`/ticket-views/${id}/`);
  personalViews.reset();
  delete viewPageMeta[viewId];
}


// ---------------------------------------------------------------------------------------------------------------
// ESCRITAS REAIS
//
// Uma ação do Helpdesk vira de 1 a 4 chamadas SEM transação no backend. `planTicketUpdate` (mappers/outbound.ts)
// decide os passos e a ordem; aqui eles são executados um a um e uma falha no meio vira `PartialUpdateError`, que diz
// exatamente o que foi e o que não foi aplicado. O formulário usa isso para manter o texto, ajustar o que já valeu e
// repetir só o que falta (nunca a mensagem que já foi gravada).
// ---------------------------------------------------------------------------------------------------------------

const invalidateTickets = (): void => {
  loadAll.reset();
  personalViews.reset();
};

async function fetchDetailDto(id: number): Promise<TicketDetailDto> {
  return http.get<TicketDetailDto>(`/tickets/${id}/`);
}

async function mapDto(dto: TicketDetailDto): Promise<Ticket> {
  const [statuses, staff, clients] = await Promise.all([getStatuses(), getStaff().catch(() => []), getClients().catch(() => [])]);
  const known = requesterByTicket.get(dto.id);
  if (dto.requester) requesterByTicket.set(dto.id, String(dto.requester.id));
  return withLocalTicketFields(mapTicketDetail(dto, { statuses, staff, clients, requesterId: known }));
}

const isUnknownOutcome = (e: unknown): boolean => e instanceof ApiError && (e.status === 0 || (e.status ?? 0) >= 500);

async function runStep(id: number, step: PlanStep, last: TicketDetailDto, window?: ResolutionWindow): Promise<TicketDetailDto> {
  switch (step.kind) {
    case 'macro':
      return http.post<TicketDetailDto>(`/tickets/${id}/apply-macro/`, step.body);
    case 'props':
      return http.patch<TicketDetailDto>(`/tickets/${id}/`, step.body);
    case 'follow':
      return http.post<TicketDetailDto>(`/tickets/${id}/follow/`);
    case 'unfollow':
      return http.post<TicketDetailDto>(`/tickets/${id}/unfollow/`);
    case 'close': {
      const w = window ?? resolutionWindow(last);
      return http.post<TicketDetailDto>(`/tickets/${id}/close/`, { resolution_started_at: w.started, resolution_ended_at: w.ended, note: '' });
    }
    case 'reply': {
      const fields: Record<string, unknown> = { ...step.body };
      if (step.needsWindow) {
        const w = window ?? resolutionWindow(last);
        fields.resolution_started_at = w.started;
        fields.resolution_ended_at = w.ended;
      }
      const before = last.messages.length;
      try {
        return await http.post<TicketDetailDto>(`/tickets/${id}/reply/`, step.files?.length ? toFormData(fields, step.files) : fields);
      } catch (e) {
        // Sem resposta (rede/5xx): a mensagem pode ter sido gravada. Confere antes de deixar "Tentar novamente" duplicá-la.
        if (!isUnknownOutcome(e)) throw e;
        const fresh = await fetchDetailDto(id).catch(() => null);
        const lastMsg = fresh?.messages[fresh.messages.length - 1];
        if (fresh && fresh.messages.length > before && lastMsg?.body === String(fields.body)) return fresh;
        throw e;
      }
    }
    case 'stage': {
      const res = await http.post<{ updated: number[]; failed: { id: number; detail: string }[] }>('/tickets/bulk-status/', { ticket_ids: [id], stage_id: step.body!.stage_id });
      const fail = res.failed?.find((f) => f.id === id);
      if (fail && !/já está neste status/i.test(fail.detail)) throw new ApiError(fail.detail, { status: 409 });
      return fetchDetailDto(id);
    }
  }
}

/** Executa os passos em ordem; falha no meio -> `PartialUpdateError` com o relato exato. */
async function runPlan(id: number, plan: TicketPlan, start: TicketDetailDto, opts: { created?: boolean; resolutionWindow?: ResolutionWindow } = {}): Promise<{ dto: TicketDetailDto; commentSent: boolean }> {
  let last = start;
  const done: PlanStep[] = [];
  let commentSent = false;
  for (const step of plan.steps) {
    try {
      last = await runStep(id, step, last, opts.resolutionWindow);
      done.push(step);
      if (step.covers.includes('comment')) commentSent = true;
    } catch (e) {
      const cause = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : undefined);
      if (done.length === 0 && plan.steps.length === 1 && !opts.created) throw cause;
      const idx = plan.steps.indexOf(step);
      const pending = plan.steps.slice(idx).flatMap((s) => s.covers);
      const applied = done.flatMap((s) => s.covers);
      const label = labelOf;
      const localLabels = plan.localKeys.map((k) => `${labelOf(k)} (só neste navegador)`);
      throw new PartialUpdateError(cause.message, {
        appliedKeys: [...applied.filter((k) => k !== 'comment'), ...plan.localKeys],
        pendingKeys: pending.filter((k) => k !== 'comment'),
        appliedLabels: [...[...new Set(applied)].filter((k) => !pending.includes(k)).map(label), ...localLabels],
        pendingLabels: [...new Set(pending)].map(label),
        ticket: await mapDto(last),
        created: opts.created,
        commentSent,
        cause,
      });
    }
  }
  return { dto: last, commentSent };
}

function recordLocal(id: number, local: Partial<Ticket>): void {
  if (Object.keys(local).length === 0) return;
  layers.ticketPatches.set(id, { ...(layers.ticketPatches.get(id) ?? {}), ...local });
}

/**
 * Aplica patch e/ou mensagem a um ticket REAL (assinatura igual à do mock). Mensagem em HTML (Tiptap) vai ao backend
 * como markdown, com anexos em multipart. Campos sem equivalente no backend ficam só neste navegador
 * (`Ticket.localFields` diz quais).
 */

/** Sugestão D4 da janela de solução (para o diálogo de fechamento). */
export async function suggestResolutionWindow(id: number): Promise<import('./mappers/outbound').ResolutionWindow> {
  const dto = await fetchDetailDto(id);
  return resolutionWindow(dto);
}

export async function updateTicket(id: number, patch: TicketPatch = {}, comment?: mock.NewComment, opts: { macroIds?: string[]; resolutionWindow?: ResolutionWindow } = {}): Promise<Ticket> {
  const [statuses, dto0] = await Promise.all([getStatuses(), fetchDetailDto(id)]);
  await ensureTags(patch.tags);
  const tags = await getTags();
  const current = { statusId: resolveStatusId(dto0, statuses), followerIds: dto0.watchers.map((w) => String(w.id)) };
  const plan = planTicketUpdate({
    patch,
    comment: comment ? { markdown: htmlToMarkdown(comment.bodyHtml), public: comment.public, files: comment.files } : undefined,
    current,
    currentStageId: dto0.stage != null ? String(dto0.stage) : undefined,
    statuses,
    meId: getRealMeId(),
    tags,
    macroIds: opts.macroIds,
  });
  if (plan.blocked) throw new ApiError(plan.blocked, { status: 409 });

  recordLocal(id, localPart(plan));
  const { dto } = await runPlan(id, plan, dto0, { resolutionWindow: opts.resolutionWindow });
  invalidateTickets();
  const out = await mapDto(dto);
  return plan.localKeys.length ? { ...out, localFields: plan.localKeys } : out;
}

function localPart(plan: TicketPlan): Partial<Ticket> {
  const out: Partial<Ticket> = {};
  for (const k of LOCAL_ONLY_KEYS) if (k in plan.local) (out as Record<string, unknown>)[k] = (plan.local as Record<string, unknown>)[k];
  if (plan.local.followerIds) out.followerIds = plan.local.followerIds;
  return out;
}

/**
 * Cria o ticket: `POST /tickets/` (equipe, assunto, corpo em markdown, prioridade, solicitante, anexos) e, em seguida,
 * responsável/etiquetas/seguir/status em chamadas separadas (o POST não aceita esses campos). Se uma delas falhar o
 * ticket JÁ existe: o erro é `PartialUpdateError{created:true}` e "Tentar novamente" atualiza esse ticket, sem criar outro.
 */
export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  if (input.public === false) {
    throw new ApiError('No backend o ticket novo nasce com a descrição PÚBLICA (o solicitante a recebe). Para registrar só uma observação interna, crie o ticket com a descrição pública e adicione a observação depois. Nada foi criado.');
  }
  const [groups, statuses] = await Promise.all([getGroups(), getStatuses()]);
  const me = getRealMeId();
  const team =
    input.assigneeGroupId ||
    groups.find((g) => input.assigneeId && g.agentIds.includes(input.assigneeId))?.id ||
    groups.find((g) => g.agentIds.includes(me))?.id ||
    groups[0]?.id;
  if (!team) throw new ApiError('Escolha o grupo do ticket (o backend exige uma equipe). Nada foi criado.');
  await ensureTags(input.tags);
  const tags = await getTags();
  const markdown = htmlToMarkdown(input.bodyHtml);
  if (!markdown) throw new ApiError('Escreva a descrição do ticket. Nada foi criado.');
  const body = createTicketBody({ subject: input.subject, requesterId: input.requesterId, markdown, teamId: Number(team), priority: input.priority });
  const created = await http.post<TicketDetailDto>('/tickets/', input.files?.length ? toFormData(body, input.files) : body);
  invalidateTickets();

  const newStatusId = statusIdByCategory(statuses, 'new');
  const plan = planTicketUpdate({
    patch: {
      ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(input.statusId && input.statusId !== newStatusId ? { statusId: input.statusId } : {}),
      ...(input.followerIds?.length ? { followerIds: input.followerIds } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.ccIds?.length ? { ccIds: input.ccIds } : {}),
      ...(input.customFields && Object.keys(input.customFields).length ? { customFields: input.customFields } : {}),
    },
    current: { statusId: resolveStatusId(created, statuses), followerIds: created.watchers?.map((w) => String(w.id)) ?? [] },
    currentStageId: created.stage != null ? String(created.stage) : undefined,
    statuses,
    meId: me,
    tags,
    macroIds: input.macroIds,
  });
  recordLocal(created.id, localPart(plan));
  if (plan.blocked) throw new PartialUpdateError(plan.blocked, { appliedKeys: [], pendingKeys: [], appliedLabels: [`ticket #${created.id} criado`], pendingLabels: [], ticket: await mapDto(created), created: true, commentSent: true });
  const { dto } = await runPlan(created.id, plan, created, { created: true });
  invalidateTickets();
  const out = await mapDto(dto);
  return plan.localKeys.length ? { ...out, localFields: plan.localKeys } : out;
}

/**
 * Ações em lote NO SERVIDOR: `bulk-assign`, `bulk-priority`, `bulk-status` e, para "resolvido", um `close` por ticket
 * (cada um com a janela de solução do próprio ticket; o `bulk-close` exigiria uma janela única e o backend recusa
 * início anterior à criação de qualquer um dos tickets). Falhas vêm em `failed[]` (parcial por ticket).
 */
export async function bulkUpdate(ids: number[], change: BulkChange): Promise<BulkResult> {
  const failed = new Map<number, string>();
  const note = (list: { id: number; detail: string }[] | undefined) => (list ?? []).forEach((f) => failed.set(f.id, f.detail));
  const statuses = await getStatuses();
  if (change.assigneeId !== undefined) {
    note((await http.post<{ failed: { id: number; detail: string }[] }>('/tickets/bulk-assign/', { ticket_ids: ids, assignee_id: Number(change.assigneeId) })).failed);
  }
  if (change.priority) {
    note((await http.post<{ failed: { id: number; detail: string }[] }>('/tickets/bulk-priority/', { ticket_ids: ids, priority: change.priority })).failed);
  }
  if (change.statusId) {
    const target = statuses.find((s) => s.id === change.statusId);
    const todo = ids.filter((id) => !failed.has(id));
    if (target?.category === 'solved') {
      await pool(todo, DETAIL_CONCURRENCY, async (id) => {
        try {
          const dto = await fetchDetailDto(id);
          const w = resolutionWindow(dto);
          await http.post(`/tickets/${id}/close/`, { resolution_started_at: w.started, resolution_ended_at: w.ended, note: '' });
        } catch (e) {
          failed.set(id, e instanceof Error ? e.message : 'Não foi possível fechar.');
        }
      });
    } else if (todo.length > 0) {
      note((await http.post<{ failed: { id: number; detail: string }[] }>('/tickets/bulk-status/', { ticket_ids: todo, stage_id: Number(change.statusId) })).failed);
    }
  }
  invalidateTickets();
  const okIds = ids.filter((id) => !failed.has(id));
  const updated: Ticket[] = [];
  await pool(okIds, DETAIL_CONCURRENCY, async (id) => {
    updated.push(await mapDto(await fetchDetailDto(id)));
  });
  return { updated: updated.sort((a, b) => a.id - b.id), failed: [...failed].map(([id, message]) => ({ id, message })) };
}

// ---------------------------------------------------------------------------------------------------------------
// Sem equivalente no backend (continuam LOCAIS, em memória): apagar, fundir e o motor de gatilhos.
// ---------------------------------------------------------------------------------------------------------------

export async function applyAutomation(id: number, patch: TicketPatch, events: Parameters<typeof mock.applyAutomation>[2]): Promise<Ticket> {
  upsertInDb(db.tickets, await getTicket(id));
  const saved = await mock.applyAutomation(id, patch, events);
  layers.tickets.record(saved as Ticket & { id: number });
  return saved;
}

export async function deleteTickets(ids: number[]): Promise<number[]> {
  await allTickets();
  const out = await mock.deleteTickets(ids);
  ids.forEach((id) => layers.tickets.remove(id));
  return out;
}

export async function mergeTickets(targetId: number, sourceIds: number[]): Promise<{ target: Ticket; sources: Ticket[] }> {
  for (const id of [targetId, ...sourceIds]) upsertInDb(db.tickets, await getTicket(id));
  const res = await mock.mergeTickets(targetId, sourceIds);
  [res.target, ...res.sources].forEach((t) => layers.tickets.record(t as Ticket & { id: number }));
  return res;
}

// Simulação de chegada de tickets: só no mock. No real, `startLiveUpdates` liga o WebSocket `/ws/me/` (`api/real/ws.ts`).
export { simulateIncomingTicket, simulateCustomerReply } from '../mock/tickets';
export type { TicketFilter, TicketPatch, NewComment, NewTicketInput, BulkChange, BulkResult } from '../mock/tickets';
