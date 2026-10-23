import { runView as runViewPure } from '@/lib/views';
import type { AiSummary, Ticket, View } from '@/types/domain';
import { ApiError, PartialUpdateError } from '../errors';
import * as mock from '../mock/tickets';
import type { BulkChange, BulkResult, DeleteResult, NewTicketInput, ResolutionSuggestion, TicketFilter, TicketPatch } from '../mock/tickets';
import { getRealMeId, hasRealPermission } from './auth';
import { http, type Paginated } from './http';
import { layers, mirror, upsertInDb, withLocalTicketFields } from './local';
import { HELPDESK_VIEWS, SYSTEM_EXTRA_VIEWS, aiSummaryError, ccError, countsFromSummary, deleteTicketError, mapAiSummary, mapPersonalView, mapTicketDetail, mapTicketListItem, personalViewId, restoreTicketError, type AiSummaryDto, type PersonalViewDto, type SummaryDto, type TicketDetailDto, type TicketDto, type ViewDef } from './mappers';
import { getGroups, getStaff, getStatuses, getTags, memo } from './refs';
import { ensureTags } from './tags';
import { LOCAL_ONLY_KEYS, labelOf, planNewTicket, planTicketUpdate, resolutionWindow, toFormData, type PlanStep, type ResolutionWindow, type TicketPlan } from './mappers/outbound';
import { htmlToMarkdown } from './mappers/htmlToMarkdown';
import { resolveStatusId } from './mappers/status';
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
 * A lista traz `requester_id` e `company_id` (nulos só em ticket restrito) e as mensagens trazem `author_id`:
 * nada é casado por nome e não há chamadas de detalhe só para descobrir o solicitante.
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
}
export const loadInfo: TicketsLoadInfo = { total: 0, loaded: 0, truncated: false };

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

/** DTOs da lista -> Ticket[]. `requester_id`/`company_id` já vêm na lista (ticket restrito = `requesterId` vazio). */
async function toTickets(dtos: TicketDto[]): Promise<Ticket[]> {
  const statuses = await getStatuses();
  return dtos.map((dto) => {
    const t = mapTicketListItem(dto, { statuses });
    return withLocalTicketFields({ ...t, requesterId: layers.mergedUsers.get(t.requesterId) ?? t.requesterId });
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

/** Teto de tickets trazidos para o histórico de UM cliente ou organização (páginas de 100). */
export const RELATED_MAX = 500;

/**
 * Tickets de um cliente (`?requester=`) ou de uma organização (`?company=`) direto no SERVIDOR, página a página até
 * `RELATED_MAX`: o histórico não depende mais dos 100 primeiros tickets da lista inicial.
 */
async function listRelated(filter: TicketFilter): Promise<Ticket[]> {
  const query: Record<string, number> = {};
  if (filter.requesterId) query.requester = Number(filter.requesterId);
  if (filter.orgId) query.company = Number(filter.orgId);
  if (Object.values(query).some((v) => !Number.isFinite(v))) return []; // id local/sem par no backend
  const dtos: TicketDto[] = [];
  for (let offset = 0; ; ) {
    const page = await fetchTicketPage(query, { limit: VIEW_PAGE, offset });
    dtos.push(...page.dtos);
    if (!page.hasMore || page.dtos.length === 0) break;
    if (dtos.length >= RELATED_MAX) {
      console.info(`Helpdesk: ${page.total} tickets no servidor para este filtro; mostrando os ${dtos.length} mais recentes.`);
      break;
    }
    offset += page.dtos.length;
  }
  return layers.tickets.apply(await toTickets(dtos));
}

export async function listTickets(filter: TicketFilter = {}): Promise<Ticket[]> {
  const all = filter.requesterId || filter.orgId ? await listRelated(filter) : await allTickets();
  const q = filter.query ? fold(filter.query) : '';
  return all.filter(
    (t) =>
      (!filter.statusIds || filter.statusIds.includes(t.statusId)) &&
      (!filter.channel || t.channel === filter.channel) &&
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
  const [dto, statuses, staff] = await Promise.all([http.get<TicketDetailDto>(`/tickets/${id}/`), getStatuses(), getStaff().catch(() => [])]);
  const ticket = withLocalTicketFields(mapTicketDetail(dto, { statuses, staff }));
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
export async function runView(viewId: string, opts: { offset?: number; limit?: number; type?: string } = {}): Promise<Ticket[]> {
  const view = (await listViews()).find((v) => v.id === viewId);
  if (!view) throw new ApiError('Visualização não encontrada.');
  if (view.query) {
    const limit = opts.limit ?? VIEW_PAGE;
    const offset = opts.offset ?? 0;
    // `type` (filtro da gaveta) vai ao servidor junto da consulta da visão: `?type=incident` (lista separada por vírgula; `none` = sem tipo).
    const page = await fetchTicketPage(opts.type ? { ...view.query, type: opts.type } : view.query, { limit, offset });
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
  const [statuses, staff] = await Promise.all([getStatuses(), getStaff().catch(() => [])]);
  return withLocalTicketFields(mapTicketDetail(dto, { statuses, staff }));
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
    case 'cc_add':
      return http.post<TicketDetailDto>(`/tickets/${id}/cc/`, step.body);
    case 'cc_remove':
      return http.delete<TicketDetailDto>(`/tickets/${id}/cc/${step.body!.cc_id}/`);
    case 'follower_add':
      return http.post<TicketDetailDto>(`/tickets/${id}/followers/`, step.body);
    case 'follower_remove':
      return http.delete<TicketDetailDto>(`/tickets/${id}/followers/${step.body!.user_id}/`);
    case 'close': {
      const w = window ?? resolutionWindow(last);
      // `stage` = status personalizado da categoria fechada; sem ele o backend usa o "Fechado" de fábrica.
      return http.post<TicketDetailDto>(`/tickets/${id}/close/`, { resolution_started_at: w.started, resolution_ended_at: w.ended, note: '', ...(step.body?.stage ? { stage: step.body.stage } : {}) });
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
  const current = { statusId: resolveStatusId(dto0, statuses), followerIds: dto0.watchers.map((w) => String(w.id)), ccs: (dto0.cc ?? []).map((c) => ({ id: String(c.id), email: c.email })) };
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
  return out;
}

/**
 * Cria o ticket em UMA chamada: `POST /tickets/` já leva responsável, status (por `stage`), etiquetas (ids) e
 * `is_public:false` (descrição como observação interna). O backend confere tudo antes de gravar: uma recusa (400)
 * não deixa ticket criado pela metade. Só o que o POST não cobre (seguir, macros, fechar já na criação, campos locais)
 * vira chamadas seguintes; se uma delas falhar o ticket JÁ existe: `PartialUpdateError{created:true}` e "Tentar
 * novamente" atualiza esse ticket, sem criar outro.
 */
export async function createTicket(input: NewTicketInput): Promise<Ticket> {
  const [allGroups, statuses] = await Promise.all([getGroups(), getStatuses()]);
  const groups = allGroups.filter((g) => !g.inactive); // equipe desativada não recebe tickets (o backend recusa)
  const me = getRealMeId();
  const team =
    input.assigneeGroupId ||
    groups.find((g) => input.assigneeId && g.agentIds.includes(input.assigneeId))?.id ||
    groups.find((g) => g.agentIds.includes(me))?.id ||
    groups[0]?.id;
  if (!team) throw new ApiError('Escolha o grupo do ticket (o backend exige uma equipe). Nada foi criado.');
  if (input.public === false && !hasRealPermission('ticket.add_internal_note')) {
    throw new ApiError('Você não tem permissão para registrar observação interna. Nada foi criado.', { status: 403 });
  }
  await ensureTags(input.tags);
  const tags = await getTags();
  const markdown = htmlToMarkdown(input.bodyHtml);
  if (!markdown) throw new ApiError('Escreva a descrição do ticket. Nada foi criado.');
  const { body, followUp } = planNewTicket(
    { subject: input.subject, requesterId: input.requesterId, markdown, teamId: Number(team), priority: input.priority, assigneeId: input.assigneeId, statusId: input.statusId, tags: input.tags, public: input.public, followerIds: input.followerIds, type: input.type, ccIds: input.ccIds, customFields: input.customFields },
    { statuses, tags },
  );
  const created = await http.post<TicketDetailDto>('/tickets/', input.files?.length ? toFormData(body, input.files) : body);
  invalidateTickets();

  const plan = planTicketUpdate({
    patch: followUp,
    current: { statusId: resolveStatusId(created, statuses), followerIds: created.watchers?.map((w) => String(w.id)) ?? [], ccs: (created.cc ?? []).map((c) => ({ id: String(c.id), email: c.email })) },
    currentStageId: created.stage != null ? String(created.stage) : undefined,
    statuses,
    meId: me,
    tags,
    macroIds: input.macroIds,
  });
  recordLocal(created.id, localPart(plan));
  if (plan.steps.length === 0) {
    const out = await mapDto(created);
    return plan.localKeys.length ? { ...out, localFields: plan.localKeys } : out;
  }
  const { dto } = await runPlan(created.id, plan, created, { created: true });
  invalidateTickets();
  const out = await mapDto(dto);
  return plan.localKeys.length ? { ...out, localFields: plan.localKeys } : out;
}

/**
 * Janela sugerida (D4) de vários tickets para o diálogo do fechamento em lote: um detalhe por ticket
 * (6 em paralelo), porque o início depende dos eventos do ticket. Tickets que não abrem ficam de fora.
 */
export async function suggestResolutionWindows(ids: number[]): Promise<ResolutionSuggestion[]> {
  const out = new Map<number, ResolutionSuggestion>();
  await pool(ids, DETAIL_CONCURRENCY, async (id) => {
    try {
      const dto = await fetchDetailDto(id);
      const w = resolutionWindow(dto);
      out.set(id, { id, reference: dto.reference, subject: dto.subject, createdAt: dto.created_at, started: w.started, ended: w.ended });
    } catch {
      /* o ticket não abriu: fica fora do lote (o diálogo avisa a diferença) */
    }
  });
  return ids.flatMap((id) => (out.has(id) ? [out.get(id)!] : []));
}

type BulkFailures = { updated?: number[]; failed?: { id: number | null; detail: string }[] };

/**
 * Ações em lote NO SERVIDOR: `bulk-assign`, `bulk-priority`, `bulk-status` e, para "resolvido", `bulk-close` com
 * `items:[{id, resolution_started_at, resolution_ended_at}]` (a janela de CADA ticket, confirmada no diálogo).
 * Todas pedem `report_missing:true`: id que não existe ou que o usuário não enxerga volta em `failed[]`.
 * O `bulk-close` não aceita `stage`: para um status personalizado da categoria fechada o fechamento é ticket a ticket
 * (`close/` com `stage`). Falhas por ticket vêm em `failed[]` (parcial) e o resto é alterado.
 */
export async function bulkUpdate(ids: number[], change: BulkChange): Promise<BulkResult> {
  const failed = new Map<number, string>();
  const note = (res: BulkFailures | undefined) => (res?.failed ?? []).forEach((f) => f.id != null && failed.set(f.id, f.detail));
  const statuses = await getStatuses();
  if (change.assigneeId !== undefined) {
    note(await http.post<BulkFailures>('/tickets/bulk-assign/', { ticket_ids: ids, assignee_id: Number(change.assigneeId), report_missing: true }));
  }
  if (change.priority) {
    note(await http.post<BulkFailures>('/tickets/bulk-priority/', { ticket_ids: ids, priority: change.priority, report_missing: true }));
  }
  if (change.statusId) {
    const target = statuses.find((s) => s.id === change.statusId);
    const todo = ids.filter((id) => !failed.has(id));
    if (target?.category === 'solved') {
      const given = new Map((change.resolutions ?? []).map((r) => [r.id, r]));
      const windows = new Map<number, ResolutionWindow>();
      await pool(todo, DETAIL_CONCURRENCY, async (id) => {
        const r = given.get(id);
        if (r) return void windows.set(id, { started: r.started, ended: r.ended });
        try {
          windows.set(id, resolutionWindow(await fetchDetailDto(id))); // sem janela confirmada: sugestão D4 do ticket
        } catch (e) {
          failed.set(id, e instanceof Error ? e.message : 'Não foi possível calcular a janela da solução.');
        }
      });
      const ready = todo.filter((id) => windows.has(id));
      if (target.system) {
        if (ready.length > 0) {
          note(
            await http.post<BulkFailures>('/tickets/bulk-close/', {
              items: ready.map((id) => ({ id, resolution_started_at: windows.get(id)!.started, resolution_ended_at: windows.get(id)!.ended })),
              report_missing: true,
            }),
          );
        }
      } else {
        await pool(ready, DETAIL_CONCURRENCY, async (id) => {
          const w = windows.get(id)!;
          try {
            await http.post(`/tickets/${id}/close/`, { resolution_started_at: w.started, resolution_ended_at: w.ended, note: '', stage: Number(target.id) });
          } catch (e) {
            failed.set(id, e instanceof Error ? e.message : 'Não foi possível fechar.');
          }
        });
      }
    } else if (todo.length > 0) {
      note(await http.post<BulkFailures>('/tickets/bulk-status/', { ticket_ids: todo, stage_id: Number(change.statusId), report_missing: true }));
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
// CC de terceiros e seguidores (POST/DELETE em `cc/` e `followers/`), apagar/restaurar e resumo de IA: servidor.
// Fusão e o motor de gatilhos continuam LOCAIS (em memória).
// ---------------------------------------------------------------------------------------------------------------

export async function applyAutomation(id: number, patch: TicketPatch, events: Parameters<typeof mock.applyAutomation>[2]): Promise<Ticket> {
  upsertInDb(db.tickets, await getTicket(id));
  const saved = await mock.applyAutomation(id, patch, events);
  layers.tickets.record(saved as Ticket & { id: number });
  return saved;
}

/** Adiciona um e-mail ao CC (`POST cc/`; 200 se já estava). 400 (e-mail inválido, é o do solicitante, mais de 20) sobe com o motivo. */
export async function addTicketCc(id: number, input: { email: string; name?: string }): Promise<Ticket> {
  try {
    const dto = await http.post<TicketDetailDto>(`/tickets/${id}/cc/`, { email: input.email.trim(), ...(input.name?.trim() ? { name: input.name.trim() } : {}) });
    invalidateTickets();
    return await mapDto(dto);
  } catch (e) {
    throw ccError(e);
  }
}

export async function removeTicketCc(id: number, ccId: string): Promise<Ticket> {
  try {
    const dto = await http.delete<TicketDetailDto>(`/tickets/${id}/cc/${ccId}/`);
    invalidateTickets();
    return await mapDto(dto);
  } catch (e) {
    throw ccError(e);
  }
}

/** Segue o ticket em nome de outra pessoa (`POST followers/ {user_id}`): interno ativo ou cliente ativo da mesma empresa. */
export async function addTicketFollower(id: number, userId: string): Promise<Ticket> {
  try {
    const dto = await http.post<TicketDetailDto>(`/tickets/${id}/followers/`, { user_id: Number(userId) });
    invalidateTickets();
    return await mapDto(dto);
  } catch (e) {
    throw ccError(e);
  }
}

export async function removeTicketFollower(id: number, userId: string): Promise<Ticket> {
  try {
    const dto = await http.delete<TicketDetailDto>(`/tickets/${id}/followers/${userId}/`);
    invalidateTickets();
    return await mapDto(dto);
  } catch (e) {
    throw ccError(e);
  }
}

/**
 * Apaga tickets NO SERVIDOR (exclusão lógica, só `settings.manage`): `DELETE /tickets/{id}/` (204), um por ticket.
 * Quem falha (403, 404, 409 `ticket_conflict`) fica em `failed` com a frase pronta e NÃO entra em `deleted`: a store
 * só tira da tela o que o servidor confirmou.
 */
export async function deleteTickets(ids: number[]): Promise<DeleteResult> {
  const deleted: number[] = [];
  const failed: DeleteResult['failed'] = [];
  await pool(ids, DETAIL_CONCURRENCY, async (id) => {
    try {
      await http.delete(`/tickets/${id}/`);
      deleted.push(id);
    } catch (e) {
      const err = deleteTicketError(e, id);
      failed.push({ id, message: err.message, status: err.status, code: err.code });
    }
  });
  if (deleted.length > 0) invalidateTickets();
  return { deleted: ids.filter((id) => deleted.includes(id)), failed: ids.flatMap((id) => failed.filter((f) => f.id === id)) };
}

/** `POST /tickets/{id}/restore/` (só `settings.manage`, até 30 dias depois). Devolve o ticket já restaurado. */
export async function restoreTicket(id: number): Promise<Ticket> {
  try {
    const dto = await http.post<TicketDetailDto>(`/tickets/${id}/restore/`);
    invalidateTickets();
    return await mapDto(dto);
  } catch (e) {
    throw restoreTicketError(e, id);
  }
}

/** Resumo por IA (`POST ai-summary/`). Nada é gravado: quem chama guarda o texto só na sessão da aba. */
export async function generateAiSummary(id: number): Promise<AiSummary> {
  try {
    return mapAiSummary(await http.post<AiSummaryDto>(`/tickets/${id}/ai-summary/`, undefined, { timeoutMs: 60_000 }));
  } catch (e) {
    throw aiSummaryError(e);
  }
}

export async function mergeTickets(targetId: number, sourceIds: number[]): Promise<{ target: Ticket; sources: Ticket[] }> {
  for (const id of [targetId, ...sourceIds]) upsertInDb(db.tickets, await getTicket(id));
  const res = await mock.mergeTickets(targetId, sourceIds);
  [res.target, ...res.sources].forEach((t) => layers.tickets.record(t as Ticket & { id: number }));
  return res;
}

// Simulação de chegada de tickets: só no mock. No real, `startLiveUpdates` liga o WebSocket `/ws/me/` (`api/real/ws.ts`).
export { simulateIncomingTicket, simulateCustomerReply } from '../mock/tickets';
export type { TicketFilter, TicketPatch, NewComment, NewTicketInput, BulkChange, BulkResult, BulkResolution, ResolutionSuggestion, DeleteResult } from '../mock/tickets';
