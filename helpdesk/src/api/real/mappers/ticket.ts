import { sanitizeHtml } from '@/lib/sanitizeHtml';
import type { AuditEvent, Comment, Priority, SlaState, Ticket, TicketSla, TicketStatus, User } from '@/types/domain';
import type { MessageDto, SlaClockDto, TicketDetailDto, TicketDto, TicketEventDto } from './dto';
import { markdownToHtml } from './markdown';
import { mapCategory, resolveStatusId } from './status';

const PRIORITIES: ReadonlySet<string> = new Set(['low', 'normal', 'high', 'urgent']);

export const mapPriority = (p: string | null | undefined): Priority => (p && PRIORITIES.has(p) ? (p as Priority) : 'normal');

/** `source` do backend (`web|chat|internal`) -> canal do Helpdesk. Não há e-mail no backend; tudo cai em `web_form`. */
export const mapChannel = (_source: string): Ticket['channel'] => 'web_form';

const SOURCES = new Set(['web', 'chat', 'internal']);

const SLA_STATE: Record<string, SlaState | undefined> = { ok: 'ok', at_risk: 'warning', breached: 'breached', met: 'met' };

/**
 * SLA do backend (dois relógios: primeira resposta e resolução) -> um `TicketSla`: o relógio pendente mais urgente
 * (estourado, depois o de menor prazo). Sem pendentes, o último cumprido (`met`). Sem prazos, `undefined`.
 */
export function mapSla(sla: TicketDto['sla']): TicketSla | undefined {
  const clocks: { name: string; target: TicketSla['target']; clock: SlaClockDto }[] = [
    { name: 'Primeira resposta', target: 'first_reply', clock: sla?.first_response as SlaClockDto },
    { name: 'Resolução', target: 'resolution', clock: sla?.resolution as SlaClockDto },
  ];
  const usable = clocks.filter((c) => c.clock && c.clock.due_at && SLA_STATE[c.clock.state]);
  const pending = usable.filter((c) => c.clock.state !== 'met').sort((a, b) => Date.parse(a.clock.due_at!) - Date.parse(b.clock.due_at!));
  const pick = pending[0] ?? usable.sort((a, b) => Date.parse(b.clock.due_at!) - Date.parse(a.clock.due_at!))[0];
  if (!pick) return undefined;
  return { name: pick.name, target: pick.target, dueAt: pick.clock.due_at!, state: SLA_STATE[pick.clock.state]! };
}

export interface TicketMapContext {
  statuses: TicketStatus[];
}

/** Item da LISTA (`TicketListSerializer`): sem mensagens/eventos; `detailed:false`. */
export function mapTicketListItem(dto: TicketDto, ctx: TicketMapContext): Ticket {
  return {
    id: dto.id,
    reference: dto.reference,
    subject: dto.subject,
    // `requester_id` vem do backend; nulo = ticket restrito (o nome mascarado segue em `requesterName`).
    requesterId: dto.requester_id != null ? String(dto.requester_id) : '',
    requesterName: dto.requester_display,
    companyName: dto.company_name ?? undefined,
    orgId: dto.company_id != null ? String(dto.company_id) : undefined,
    assigneeGroupId: String(dto.team.id),
    assigneeId: dto.assignee_id != null ? String(dto.assignee_id) : undefined,
    assigneeName: dto.assignee_name ?? undefined,
    followerIds: [],
    ccIds: [],
    tags: dto.tags.map((t) => t.name),
    priority: mapPriority(dto.priority),
    statusId: resolveStatusId({ status: dto.status, stage: dto.stage }, ctx.statuses),
    channel: mapChannel(dto.source),
    source: SOURCES.has(dto.source) ? (dto.source as Ticket['source']) : 'web',
    formId: 'default',
    customFields: {},
    sla: mapSla(dto.sla),
    comments: [],
    events: [],
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    detailed: false,
  };
}

const CHANNEL_BY_SOURCE: Record<string, Comment['channel']> = { web: 'web_form', chat: 'chat', system: 'system' };

/**
 * Autor da mensagem: `author_id` do backend. Mensagem do sistema -> `system`. Sem id (autor que o usuário não pode
 * ver, ou conta removida) -> `name:<nome>`, que nunca colide com um id real; a tela usa `authorName`/`authorAvatarUrl`.
 */
export function messageAuthorId(m: Pick<MessageDto, 'author_id' | 'author_name' | 'source'>): string {
  if (m.author_id != null) return String(m.author_id);
  return m.source === 'system' ? 'system' : `name:${m.author_name}`;
}

/** Mensagem -> Comment: corpo markdown -> HTML sanitizado. */
export function mapMessage(m: MessageDto): Comment {
  const signature = m.signature_html ? signatureHtml(m.signature_html) : '';
  const body = m.is_deleted ? '<p><em>Mensagem apagada.</em></p>' : markdownToHtml(m.body, m.mentions);
  return {
    id: String(m.id),
    authorId: messageAuthorId(m),
    authorName: m.author_name,
    authorInternal: m.author_is_internal,
    authorAvatarUrl: m.author_avatar,
    public: m.is_public,
    bodyHtml: body + signature,
    channel: CHANNEL_BY_SOURCE[m.source] ?? 'web_form',
    attachments: m.attachments.map((a) => ({ name: a.filename, size: a.size_bytes, url: a.url, downloadable: a.is_downloadable })),
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deleted: m.is_deleted || undefined,
  };
}

/** A assinatura já chega em HTML higienizado pelo backend; passa pelo sanitizador do front mesmo assim. */
function signatureHtml(html: string): string {
  const clean = sanitizeHtml(html);
  return clean ? `<div>${clean}</div>` : '';
}

const eventLabel = (e: TicketEventDto, name: (c: string | null) => string): string => {
  if (e.note) return e.note;
  if (e.from_status === null) return 'Ticket criado';
  if (e.is_reopen) return `Ticket reaberto: ${name(e.from_status)} para ${name(e.to_status)}`;
  return `Status: ${name(e.from_status)} para ${name(e.to_status)}`;
};

const CATEGORY_NAME: Record<string, string> = { new: 'Novo', open: 'Aberto', pending: 'Pendente', solved: 'Resolvido' };
const categoryName = (c: string | null): string => (c === null ? '-' : (CATEGORY_NAME[mapCategory(c)] ?? c));

/** Evento de status (`TicketStatusEvent`) -> AuditEvent `field_change`; automático sem autor = `system`. `meta` é sintetizado. */
export function mapEvent(e: TicketEventDto, users: { staff: User[] }): AuditEvent {
  const actor = e.actor_name ? users.staff.filter((u) => u.name === e.actor_name) : [];
  return {
    id: String(e.id),
    authorId: e.is_automatic || !e.actor_name ? 'system' : actor.length === 1 ? actor[0]!.id : `name:${e.actor_name}`,
    kind: 'field_change',
    text: eventLabel(e, categoryName),
    meta: e.from_status === null ? undefined : { De: categoryName(e.from_status), Para: categoryName(e.to_status) },
    createdAt: e.created_at,
  };
}

export interface DetailMapContext extends TicketMapContext {
  staff: User[];
}

/** DETALHE: lista + mensagens + eventos + seguidores; o solicitante vem de `requester.id` (autoritativo). */
export function mapTicketDetail(dto: TicketDetailDto, ctx: DetailMapContext): Ticket {
  const base = mapTicketListItem(dto, { statuses: ctx.statuses });
  const requesterId = dto.requester ? String(dto.requester.id) : base.requesterId;
  const requesterName = dto.requester?.name ?? dto.requester_display;
  return {
    ...base,
    requesterId,
    requesterName,
    followerIds: dto.watchers.map((w) => String(w.id)),
    comments: dto.messages.map(mapMessage),
    events: dto.events.map((e) => mapEvent(e, { staff: ctx.staff })),
    detailed: true,
  };
}
