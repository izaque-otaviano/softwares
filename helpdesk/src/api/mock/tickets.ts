import { ME_ID } from './data';
import { countViews, runView as runViewPure, type ViewContext } from '@/lib/views';
import type { AuditEvent, Comment, Priority, Ticket, View } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

export function viewContext(now: Date = new Date()): ViewContext {
  return { meId: ME_ID, now, statuses: db.statuses };
}

export interface TicketFilter {
  statusIds?: string[];
  channel?: Ticket['channel'];
  requesterId?: string;
  assigneeId?: string;
  query?: string;
}

export function listTickets(filter: TicketFilter = {}): Promise<Ticket[]> {
  return simulate(() =>
    db.tickets.filter(
      (t) =>
        (!filter.statusIds || filter.statusIds.includes(t.statusId)) &&
        (!filter.channel || t.channel === filter.channel) &&
        (!filter.requesterId || t.requesterId === filter.requesterId) &&
        (!filter.assigneeId || t.assigneeId === filter.assigneeId) &&
        (!filter.query || t.subject.toLowerCase().includes(filter.query.toLowerCase())),
    ),
  );
}

export function getTicket(id: number): Promise<Ticket> {
  return simulate(() => {
    const t = db.tickets.find((x) => x.id === id);
    if (!t) throw new ApiError('Ticket não encontrado.');
    return t;
  });
}

export function listViews(): Promise<View[]> {
  return simulate(() => db.views, { critical: true });
}

/** Contadores de todas as views por `countKey`. Nunca falha. */
export function getViewCounts(): Promise<Record<string, number>> {
  return simulate(() => countViews(db.views, db.tickets, viewContext()), { critical: true });
}

export function runView(viewId: string, _opts: { offset?: number; limit?: number } = {}): Promise<Ticket[]> {
  return simulate(() => {
    const v = db.views.find((x) => x.id === viewId);
    if (!v) throw new ApiError('Visualização não encontrada.');
    return runViewPure(v, db.tickets, viewContext());
  });
}

export type TicketPatch = Partial<
  Pick<Ticket, 'subject' | 'requesterId' | 'assigneeId' | 'assigneeGroupId' | 'statusId' | 'priority' | 'type' | 'tags' | 'followerIds' | 'ccIds' | 'customFields'>
>;

export interface NewComment {
  authorId: string;
  public: boolean;
  bodyHtml: string;
  channel?: Comment['channel'];
  /** Anexos escolhidos no compositor. Só o modo real os envia (multipart); o mock os ignora. */
  files?: File[];
}

function nextId(): number {
  return db.tickets.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

let seq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++seq}`;
}

/** Aplica patch e/ou novo comentário; devolve o ticket atualizado. */
export async function suggestResolutionWindow(_id: number): Promise<{ started: string; ended: string }> {
  const now = new Date();
  const ended = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
  return { started: ended, ended };
}

export function updateTicket(id: number, patch: TicketPatch = {}, comment?: NewComment, _opts: { macroIds?: string[]; resolutionWindow?: { started: string; ended: string } } = {}): Promise<Ticket> {
  return simulate(() => {
    const i = db.tickets.findIndex((t) => t.id === id);
    if (i < 0) throw new ApiError('Ticket não encontrado.');
    const prev = db.tickets[i];
    const now = new Date().toISOString();
    const events: AuditEvent[] = [];
    (Object.keys(patch) as (keyof TicketPatch)[]).forEach((key) => {
      if (key === 'customFields' || JSON.stringify(prev[key]) === JSON.stringify(patch[key])) return;
      events.push({
        id: uid('e'),
        authorId: ME_ID,
        kind: 'field_change',
        text: `${key} alterado`,
        meta: { De: String(prev[key] ?? '-'), Para: String(patch[key] ?? '-') },
        createdAt: now,
      });
    });
    const comments = comment
      ? [...prev.comments, { id: uid('c'), channel: 'web_form' as const, attachments: [], createdAt: now, authorId: comment.authorId, public: comment.public, bodyHtml: comment.bodyHtml, ...(comment.channel ? { channel: comment.channel } : {}) }]
      : prev.comments;
    const next: Ticket = {
      ...prev,
      ...patch,
      customFields: { ...prev.customFields, ...patch.customFields },
      comments,
      events: [...prev.events, ...events],
      updatedAt: now,
    };
    db.tickets[i] = next;
    return next;
  });
}

export interface BulkChange {
  assigneeId?: string;
  priority?: Priority;
  statusId?: string;
}
export interface BulkResult {
  updated: Ticket[];
  failed: { id: number; message: string }[];
}

/** Ação em lote: um `updateTicket` por ticket; falhas por ticket vêm em `failed`. */
export async function bulkUpdate(ids: number[], change: BulkChange): Promise<BulkResult> {
  const updated: Ticket[] = [];
  const failed: BulkResult['failed'] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        updated.push(await updateTicket(id, change));
      } catch (e) {
        failed.push({ id, message: e instanceof Error ? e.message : 'Não foi possível alterar o ticket.' });
      }
    }),
  );
  return { updated: updated.sort((a, b) => a.id - b.id), failed };
}

export interface NewTicketInput {
  subject: string;
  requesterId: string;
  bodyHtml: string;
  assigneeGroupId?: string;
  assigneeId?: string;
  statusId?: string;
  priority?: Priority;
  type?: Ticket['type'];
  tags?: string[];
  channel?: Ticket['channel'];
  ccIds?: string[];
  followerIds?: string[];
  customFields?: Ticket['customFields'];
  /** Primeiro comentário público? Padrão: true. `false` cria o ticket com observação interna. */
  public?: boolean;
  authorId?: string;
  /** Anexos da descrição. Só o modo real os envia (multipart). */
  files?: File[];
  /** Macros usadas no formulário (só o modo real chama `apply-macro`). */
  macroIds?: string[];
}

export function createTicket(input: NewTicketInput): Promise<Ticket> {
  return simulate(() => {
    const now = new Date().toISOString();
    const id = nextId();
    const requester = db.users.find((u) => u.id === input.requesterId);
    const org = db.orgs.find((o) => o.id === requester?.orgId);
    const channel = input.channel ?? 'web_form';
    const ticket: Ticket = {
      id,
      subject: input.subject,
      requesterId: input.requesterId,
      assigneeGroupId: input.assigneeGroupId ?? org?.groupId ?? db.groups[0].id,
      assigneeId: input.assigneeId,
      followerIds: input.followerIds ?? [],
      ccIds: input.ccIds ?? [],
      tags: input.tags ?? [],
      type: input.type,
      priority: input.priority,
      statusId: input.statusId ?? (input.assigneeId ? 'open' : 'new'),
      channel,
      formId: 'default',
      customFields: input.customFields ?? {},
      comments: [{ id: uid('c'), authorId: input.authorId ?? input.requesterId, public: input.public ?? true, bodyHtml: input.bodyHtml, channel, attachments: [], createdAt: now }],
      events: [{ id: uid('e'), authorId: 'system', kind: 'notification', text: 'Ticket criado', createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    db.tickets.push(ticket);
    return ticket;
  });
}

/** Aplica o resultado do motor de gatilhos (patch + eventos de auditoria). Nunca falha: roda depois do envio. */
export function applyAutomation(id: number, patch: TicketPatch, events: AuditEvent[]): Promise<Ticket> {
  return simulate(
    () => {
      const i = db.tickets.findIndex((t) => t.id === id);
      if (i < 0) throw new ApiError('Ticket não encontrado.');
      const prev = db.tickets[i];
      const next: Ticket = {
        ...prev,
        ...patch,
        customFields: { ...prev.customFields, ...patch.customFields },
        events: [...prev.events, ...events],
        updatedAt: new Date().toISOString(),
      };
      db.tickets[i] = next;
      return next;
    },
    { critical: true },
  );
}

export function deleteTickets(ids: number[]): Promise<number[]> {
  return simulate(() => {
    db.tickets = db.tickets.filter((t) => !ids.includes(t.id));
    return ids;
  });
}

/** Funde `sourceIds` em `targetId`: origens ficam Resolvidas com tag `mesclado`; o alvo recebe um evento. */
export function mergeTickets(targetId: number, sourceIds: number[]): Promise<{ target: Ticket; sources: Ticket[] }> {
  return simulate(() => {
    const target = db.tickets.find((t) => t.id === targetId);
    if (!target) throw new ApiError('Ticket de destino não encontrado.');
    const now = new Date().toISOString();
    const sources: Ticket[] = [];
    for (const sid of sourceIds.filter((x) => x !== targetId)) {
      const i = db.tickets.findIndex((t) => t.id === sid);
      if (i < 0) continue;
      const s = db.tickets[i];
      const merged: Ticket = {
        ...s,
        statusId: 'solved',
        tags: [...new Set([...s.tags, 'mesclado'])],
        events: [...s.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `Mesclado no ticket #${targetId}`, createdAt: now }],
        updatedAt: now,
      };
      db.tickets[i] = merged;
      sources.push(merged);
    }
    const ti = db.tickets.findIndex((t) => t.id === targetId);
    const updated: Ticket = {
      ...target,
      events: [...target.events, { id: uid('e'), authorId: ME_ID, kind: 'field_change', text: `Tickets mesclados: ${sources.map((s) => `#${s.id}`).join(', ')}`, createdAt: now }],
      updatedAt: now,
    };
    db.tickets[ti] = updated;
    return { target: updated, sources };
  });
}

const NEW_TICKET_POOL: { subject: string; body: string; requesterId: string; channel: Ticket['channel']; priority: Priority }[] = [
  { subject: 'Cupom de desconto não aplica no checkout', body: 'O cupom BEMVINDO10 retorna "cupom inválido" mesmo dentro da validade.', requesterId: 'u10', channel: 'web_form', priority: 'normal' },
  { subject: 'Preciso de ajuda com a conciliação bancária', body: 'Os lançamentos de ontem não bateram com o extrato. Podem verificar?', requesterId: 'u2', channel: 'email', priority: 'high' },
  { subject: 'Atualização do cadastro de motoristas', body: 'Precisamos incluir 5 novos motoristas na plataforma com acesso ao app.', requesterId: 'u8', channel: 'email', priority: 'low' },
  { subject: 'Erro ao imprimir etiqueta de envio', body: 'A etiqueta sai cortada ao imprimir em impressora térmica 10x15.', requesterId: 'u3', channel: 'web_form', priority: 'normal' },
  { subject: 'Paciente não recebe confirmação por SMS', body: 'Alguns pacientes relatam que não receberam o SMS de confirmação da consulta.', requesterId: 'u6', channel: 'email', priority: 'high' },
];

let poolIdx = 0;

/** Simula a chegada de um ticket novo (sem atraso/falha). */
export function simulateIncomingTicket(): Ticket {
  const spec = NEW_TICKET_POOL[poolIdx++ % NEW_TICKET_POOL.length];
  const now = new Date().toISOString();
  const org = db.orgs.find((o) => o.id === db.users.find((u) => u.id === spec.requesterId)?.orgId);
  const ticket: Ticket = {
    id: nextId(),
    subject: spec.subject,
    requesterId: spec.requesterId,
    assigneeGroupId: org?.groupId ?? db.groups[0].id,
    followerIds: [],
    ccIds: [],
    tags: [],
    type: 'incident',
    priority: spec.priority,
    statusId: 'new',
    channel: spec.channel,
    formId: 'default',
    customFields: {},
    sla: { name: 'Primeira resposta', target: 'first_reply', dueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), state: 'ok' },
    comments: [{ id: uid('c'), authorId: spec.requesterId, public: true, bodyHtml: `<p>${spec.body}</p>`, channel: spec.channel, attachments: [], createdAt: now }],
    events: [{ id: uid('e'), authorId: 'system', kind: 'notification', text: 'Ticket criado', createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.push(ticket);
  return ticket;
}

const REPLIES = ['Obrigado pelo retorno! Segue o que você pediu.', 'Testei aqui e o problema continua acontecendo.', 'Consegui resolver parte, mas ainda falta o último passo.'];

/** Simula resposta de cliente num ticket não resolvido (Pendente volta para Aberto). Devolve null se não houver candidato. */
export function simulateCustomerReply(): Ticket | null {
  const open = db.tickets.filter((t) => db.statuses.find((s) => s.id === t.statusId)?.category !== 'solved' && t.assigneeId);
  if (open.length === 0) return null;
  const prev = open[Math.floor(Math.random() * open.length)];
  const now = new Date().toISOString();
  const wasPending = db.statuses.find((s) => s.id === prev.statusId)?.category === 'pending';
  const next: Ticket = {
    ...prev,
    statusId: wasPending ? 'open' : prev.statusId,
    comments: [
      ...prev.comments,
      { id: uid('c'), authorId: prev.requesterId, public: true, bodyHtml: `<p>${REPLIES[Math.floor(Math.random() * REPLIES.length)]}</p>`, channel: prev.channel, attachments: [], createdAt: now },
    ],
    updatedAt: now,
  };
  db.tickets[db.tickets.findIndex((t) => t.id === prev.id)] = next;
  return next;
}

/** Views iniciais da store (antes do primeiro `listViews`). */
export { views as initialViews } from './data';

/** Compatível com o modo real (sem paginação no mock). */
export const viewPageMeta: Record<string, { total: number; loaded: number; hasMore: boolean; offset: number }> = {};
export const VIEW_PAGE = 100;
export const HOME_PAGE = 100;

/** Mock: cria visão pessoal em memória. */
export async function createPersonalView(input: { name: string; filters?: Record<string, string> }): Promise<View> {
  const id = `pv:local-${Date.now()}`;
  const view: View = {
    id,
    name: input.name.trim() || 'Sem nome',
    conditions: { all: [] },
    columns: ['status', 'subject', 'requester', 'createdAt', 'type', 'priority'],
    countKey: id,
    query: input.filters ?? {},
    origin: 'personal',
  };
  db.views.push(view);
  return view;
}

export async function updatePersonalView(
  viewId: string,
  input: { name?: string; filters?: Record<string, string> },
): Promise<View> {
  const i = db.views.findIndex((v) => v.id === viewId);
  if (i < 0) throw new ApiError('Visualização não encontrada.', { status: 404 });
  const prev = db.views[i]!;
  const next: View = {
    ...prev,
    name: input.name !== undefined ? input.name.trim() || prev.name : prev.name,
    query: input.filters !== undefined ? input.filters : prev.query,
  };
  db.views[i] = next;
  return next;
}

export async function deletePersonalView(viewId: string): Promise<void> {
  db.views = db.views.filter((v) => v.id !== viewId);
}
