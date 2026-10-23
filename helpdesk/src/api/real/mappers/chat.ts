import type {
  Chat,
  ChatRoomEvent,
  ChatBannedWord,
  ChatCloseReason,
  ChatConfig,
  ChatFile,
  ChatMacro,
  ChatMedia,
  ChatMessage,
  ChatPresence,
  ChatPriority,
  ChatQueueInfo,
  ChatQuickReply,
  ChatReplyPreview,
  ChatStatus,
} from '@/types/chat';
import { markdownToHtml } from './markdown';

/** Formatos de resposta de `/api/v1/chat/*` (apps/chat/serializers.py). */

export interface ChatQueueDto {
  position: number;
  ahead: number;
  estimated_wait_minutes: number | null;
  queue_open: boolean;
  queue_opens_at: string | null;
}

export interface ChatRatingDto {
  service_score: number;
  resolution_score: number;
  justification: string;
  created_at: string;
}

export interface ChatDto {
  id: number;
  status: ChatStatus;
  name: string;
  client_id: number;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_avatar: string | null;
  company_name: string;
  agent_name: string | null;
  agent_id: number | null;
  agent_avatar: string | null;
  category: number | null;
  category_name: string | null;
  priority: string;
  assignee: number | null;
  assignee_name: string | null;
  tag_ids: number[];
  queued_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  reopen_count: number;
  close_reason: number | null;
  close_reason_name: string | null;
  close_note?: string;
  closed_automatically: boolean;
  closed_by_name: string | null;
  agent_score?: number | null;
  timeout_converted: boolean;
  unread_count: number;
  last_message_preview: string | null;
  client_presence?: string;
  agent_presence: string | null;
  rating: ChatRatingDto | null;
  rating_pending: boolean;
  ticket_id: number | null;
  ticket_reference: string | null;
  ws_url: string;
  queue_position: ChatQueueDto | null;
  participants: { id: number; full_name: string }[];
  can_supervise: boolean;
}

export interface ChatFileDto {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  scan_status: string;
  url: string;
  is_downloadable: boolean;
  chat_id?: number;
  message_id?: number;
  sent_at?: string;
}

export interface ChatReplyPreviewDto {
  id: number;
  author_name: string;
  excerpt: string;
  is_deleted: boolean;
  has_files: boolean;
}

export interface ChatMessageDto {
  id: number;
  author_name: string;
  author_is_internal: boolean;
  body: string;
  is_system: boolean;
  is_internal_note: boolean;
  sent_at: string;
  read_at: string | null;
  delivered_at: string | null;
  files: ChatFileDto[];
  edited_at: string | null;
  is_deleted: boolean;
  can_edit: boolean;
  reply_to: number | null;
  reply_preview: ChatReplyPreviewDto | null;
  /** Só nos eventos do WebSocket (a REST do chat atual não manda). */
  chat_id?: number;
}

export interface ChatMediaDto {
  files: ChatFileDto[];
  links: { url: string; chat_id: number; message_id: number; sent_at: string; author_name: string }[];
}

export interface ChatCloseReasonDto {
  id: number;
  name: string;
  slug: string;
  requires_note: boolean;
  is_active: boolean;
  order: number;
}

export interface ChatQuickReplyDto {
  id: number;
  contexto: 'chat' | 'ticket';
  rotulo: string;
  texto: string;
  is_active: boolean;
  order: number;
}

export interface ChatBannedWordDto {
  id: number;
  word: string;
}

export interface ChatMacroDto {
  id: number;
  name: string;
  body: string;
  chat_name: string;
  category: number | null;
  category_name: string | null;
  priority: string;
  is_active: boolean;
}

export interface ChatConfigDto {
  welcome_message: string;
  queue_timeout_minutes: number;
  max_chats_per_agent: number;
  score_min: number;
  score_max: number;
  low_score_threshold: number;
  default_team: number | null;
  default_team_name: string | null;
  queue_open: boolean;
  queue_opens_at: string | null;
  inactivity_warning_minutes: number;
  inactivity_close_minutes: number;
}

const PRIORITIES: ReadonlySet<string> = new Set(['low', 'normal', 'high', 'urgent']);
const PRESENCES: ReadonlySet<string> = new Set(['available', 'away', 'offline', 'dnd']);
const SCAN: ReadonlySet<string> = new Set(['pending', 'clean', 'infected', 'error', 'skipped']);

const priorityOf = (p: string): ChatPriority => (PRIORITIES.has(p) ? (p as ChatPriority) : 'normal');
const presenceOf = (p: string | null | undefined): ChatPresence | null => (p && PRESENCES.has(p) ? (p as ChatPresence) : null);
const idOrNull = (v: number | string | null | undefined): string | null => (v === null || v === undefined ? null : String(v));

export function mapQueue(dto: ChatQueueDto | null | undefined): ChatQueueInfo | null {
  if (!dto) return null;
  return {
    position: dto.position,
    ahead: dto.ahead,
    estimatedWaitMinutes: dto.estimated_wait_minutes ?? null,
    queueOpen: dto.queue_open,
    queueOpensAt: dto.queue_opens_at ?? null,
  };
}

/** Chat do backend -> Chat. `close_note` e `agent_score` só existem para quem é interno. */
export function mapChat(dto: ChatDto): Chat {
  return {
    id: String(dto.id),
    status: dto.status,
    name: dto.name ?? '',
    clientId: String(dto.client_id),
    clientName: dto.client_name,
    clientEmail: dto.client_email ?? '',
    clientPhone: dto.client_phone ?? '',
    clientAvatar: dto.client_avatar ?? null,
    companyName: dto.company_name ?? '',
    agentId: idOrNull(dto.agent_id),
    agentName: dto.agent_name ?? null,
    agentAvatar: dto.agent_avatar ?? null,
    categoryName: dto.category_name ?? null,
    priority: priorityOf(dto.priority),
    queuedAt: dto.queued_at,
    acceptedAt: dto.accepted_at ?? null,
    closedAt: dto.closed_at ?? null,
    reopenCount: dto.reopen_count ?? 0,
    closeReasonId: idOrNull(dto.close_reason),
    closeReasonName: dto.close_reason_name ?? null,
    closeNote: dto.close_note ?? '',
    closedByName: dto.closed_by_name ?? null,
    closedAutomatically: Boolean(dto.closed_automatically),
    agentScore: dto.agent_score ?? null,
    timeoutConverted: Boolean(dto.timeout_converted),
    unreadCount: dto.unread_count ?? 0,
    lastMessagePreview: dto.last_message_preview ?? null,
    clientPresence: presenceOf(dto.client_presence),
    agentPresence: presenceOf(dto.agent_presence),
    rating: dto.rating
      ? { serviceScore: dto.rating.service_score, resolutionScore: dto.rating.resolution_score, justification: dto.rating.justification ?? '', createdAt: dto.rating.created_at }
      : null,
    ratingPending: Boolean(dto.rating_pending),
    ticketId: idOrNull(dto.ticket_id),
    ticketReference: dto.ticket_reference ?? null,
    queue: mapQueue(dto.queue_position),
    participants: (dto.participants ?? []).map((p) => ({ id: String(p.id), name: p.full_name })),
    canSupervise: Boolean(dto.can_supervise),
  };
}

export function mapChatFile(dto: ChatFileDto): ChatFile {
  return {
    id: String(dto.id),
    name: dto.filename,
    contentType: dto.content_type,
    size: dto.size_bytes,
    scanStatus: SCAN.has(dto.scan_status) ? (dto.scan_status as ChatFile['scanStatus']) : 'pending',
    // O download é autenticado (cookie de sessão): o caminho é relativo ao host da API.
    url: dto.url,
    downloadable: dto.is_downloadable,
    isImage: /^image\/(png|jpe?g|gif|webp)$/i.test(dto.content_type),
  };
}

function mapReply(dto: ChatReplyPreviewDto | null): ChatReplyPreview | null {
  if (!dto) return null;
  return { id: String(dto.id), authorName: dto.author_name, excerpt: dto.excerpt, deleted: dto.is_deleted, hasFiles: dto.has_files };
}

/** Mensagem do backend (REST ou WebSocket) -> ChatMessage. Mensagem apagada vem sem corpo útil. */
export function mapChatMessage(dto: ChatMessageDto, chatId: string | number): ChatMessage {
  const deleted = Boolean(dto.is_deleted);
  const body = deleted ? '' : dto.body ?? '';
  return {
    id: String(dto.id),
    chatId: String(dto.chat_id ?? chatId),
    authorName: dto.author_name,
    authorIsInternal: Boolean(dto.author_is_internal),
    body,
    bodyHtml: body ? markdownToHtml(body) : '',
    isSystem: Boolean(dto.is_system),
    isInternalNote: Boolean(dto.is_internal_note),
    sentAt: dto.sent_at,
    readAt: dto.read_at ?? null,
    deliveredAt: dto.delivered_at ?? null,
    files: deleted ? [] : (dto.files ?? []).map(mapChatFile),
    editedAt: dto.edited_at ?? null,
    deleted,
    canEdit: Boolean(dto.can_edit),
    replyTo: mapReply(dto.reply_preview ?? null),
    state: 'sent',
  };
}

export function mapChatMedia(dto: ChatMediaDto): ChatMedia {
  return {
    files: dto.files.map((f) => ({ ...mapChatFile(f), messageId: String(f.message_id ?? ''), sentAt: f.sent_at ?? '' })),
    links: dto.links.map((l) => ({ url: l.url, messageId: String(l.message_id), sentAt: l.sent_at, authorName: l.author_name })),
  };
}

export function mapCloseReason(dto: ChatCloseReasonDto): ChatCloseReason {
  return { id: String(dto.id), name: dto.name, slug: dto.slug, requiresNote: dto.requires_note, active: dto.is_active, order: dto.order };
}

export function mapQuickReply(dto: ChatQuickReplyDto): ChatQuickReply {
  return { id: String(dto.id), context: dto.contexto, label: dto.rotulo, text: dto.texto, active: dto.is_active, order: dto.order };
}

export function mapBannedWord(dto: ChatBannedWordDto): ChatBannedWord {
  return { id: String(dto.id), word: dto.word };
}

export function mapChatMacro(dto: ChatMacroDto): ChatMacro {
  return {
    id: String(dto.id),
    name: dto.name,
    body: dto.body,
    chatName: dto.chat_name ?? '',
    categoryName: dto.category_name ?? null,
    priority: dto.priority && PRIORITIES.has(dto.priority) ? (dto.priority as ChatPriority) : '',
    active: dto.is_active,
  };
}

export function mapChatConfig(dto: ChatConfigDto): ChatConfig {
  return {
    welcomeMessage: dto.welcome_message,
    queueTimeoutMinutes: dto.queue_timeout_minutes,
    maxChatsPerAgent: dto.max_chats_per_agent,
    scoreMin: dto.score_min,
    scoreMax: dto.score_max,
    lowScoreThreshold: dto.low_score_threshold,
    defaultTeamId: idOrNull(dto.default_team),
    defaultTeamName: dto.default_team_name ?? null,
    queueOpen: dto.queue_open,
    queueOpensAt: dto.queue_opens_at ?? null,
    inactivityWarningMinutes: dto.inactivity_warning_minutes,
    inactivityCloseMinutes: dto.inactivity_close_minutes,
  };
}

/** ChatConfig (parcial) -> corpo do PUT /chat/config/. */
export function chatConfigToDto(input: Partial<ChatConfig>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.welcomeMessage !== undefined) out.welcome_message = input.welcomeMessage;
  if (input.queueTimeoutMinutes !== undefined) out.queue_timeout_minutes = input.queueTimeoutMinutes;
  if (input.maxChatsPerAgent !== undefined) out.max_chats_per_agent = input.maxChatsPerAgent;
  if (input.scoreMin !== undefined) out.score_min = input.scoreMin;
  if (input.scoreMax !== undefined) out.score_max = input.scoreMax;
  if (input.lowScoreThreshold !== undefined) out.low_score_threshold = input.lowScoreThreshold;
  if (input.defaultTeamId !== undefined) out.default_team = input.defaultTeamId === null || input.defaultTeamId === '' ? null : Number(input.defaultTeamId);
  if (input.inactivityWarningMinutes !== undefined) out.inactivity_warning_minutes = input.inactivityWarningMinutes;
  if (input.inactivityCloseMinutes !== undefined) out.inactivity_close_minutes = input.inactivityCloseMinutes;
  return out;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number').map(String) : []);

/**
 * Quadro do WebSocket da sala (`ws/chat/<id>/`) -> evento normalizado. `null` para tipos desconhecidos.
 * Atenção: `can_edit` de um quadro de mensagem é calculado para QUEM ENVIOU e vale para a sala toda; por isso a tela
 * recalcula "posso editar" sozinha e nunca confia no valor que chega por aqui.
 */
export function mapRoomEvent(raw: Record<string, unknown>, chatId: string | number): ChatRoomEvent | null {
  switch (raw.type) {
    case 'message':
    case 'message_edited':
    case 'message_deleted': {
      if (num(raw.id) === null) return null;
      const { type, ...rest } = raw;
      const message = mapChatMessage(rest as unknown as ChatMessageDto, chatId);
      return { type: type as 'message' | 'message_edited' | 'message_deleted', message };
    }
    case 'message_delivered':
      return { type: 'delivered', ids: ids(raw.ids) };
    case 'message_read':
      return { type: 'read', ids: ids(raw.ids) };
    case 'typing':
      return { type: 'typing', userId: String(raw.user_id ?? ''), userName: String(raw.user_name ?? ''), isTyping: raw.is_typing !== false };
    case 'accepted':
      return { type: 'accepted', agentName: String(raw.agent_name ?? '') };
    case 'transferred':
      return { type: 'transferred', agentName: String(raw.agent_name ?? '') };
    case 'closed':
      return { type: 'closed', byInternal: Boolean(raw.by_internal) };
    case 'converted':
      return { type: 'converted', ticketId: String(raw.ticket_id ?? ''), ticketReference: String(raw.ticket_reference ?? '') };
    case 'queue_position': {
      const position = num(raw.position);
      if (position === null) return null;
      return {
        type: 'queue_position',
        queue: mapQueue({
          position,
          ahead: num(raw.ahead) ?? position - 1,
          estimated_wait_minutes: num(raw.estimated_wait_minutes),
          queue_open: raw.queue_open !== false,
          queue_opens_at: typeof raw.queue_opens_at === 'string' ? raw.queue_opens_at : null,
        })!,
      };
    }
    case 'error':
      return { type: 'error', detail: String(raw.detail ?? 'Erro na conversa.') };
    default:
      return null;
  }
}
