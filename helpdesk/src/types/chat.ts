/** Tipos do chat de atendimento. Ids são texto nos dois modos (mock e real), como no resto do Helpdesk. */

export type ChatStatus = 'queued' | 'active' | 'closed';

export type ChatPresence = 'available' | 'away' | 'offline' | 'dnd';

export type ChatPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ChatQueueInfo {
  /** 1 = o próximo a ser atendido. */
  position: number;
  /** Quantos chats estão na frente. */
  ahead: number;
  /** Espera estimada em minutos; ausente quando o backend não tem base ou a fila está fechada. */
  estimatedWaitMinutes: number | null;
  queueOpen: boolean;
  queueOpensAt: string | null;
}

export interface ChatRating {
  serviceScore: number;
  resolutionScore: number;
  justification: string;
  createdAt: string;
}

export interface ChatParticipant {
  id: string;
  name: string;
}

export interface Chat {
  id: string;
  status: ChatStatus;
  /** Nome interno dado pelo agente (vira o assunto do ticket na conversão). */
  name: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAvatar: string | null;
  companyName: string;
  agentId: string | null;
  agentName: string | null;
  agentAvatar: string | null;
  categoryName: string | null;
  priority: ChatPriority;
  queuedAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  reopenCount: number;
  closeReasonId: string | null;
  closeReasonName: string | null;
  /** Observação interna de quem encerrou. */
  closeNote: string;
  closedByName: string | null;
  closedAutomatically: boolean;
  /** Nota interna do agente sobre o atendimento (0 a 10). */
  agentScore: number | null;
  timeoutConverted: boolean;
  unreadCount: number;
  lastMessagePreview: string | null;
  clientPresence: ChatPresence | null;
  agentPresence: ChatPresence | null;
  rating: ChatRating | null;
  ratingPending: boolean;
  ticketId: string | null;
  ticketReference: string | null;
  queue: ChatQueueInfo | null;
  participants: ChatParticipant[];
  /** Quem está olhando pode entrar na conversa de outro agente ou assumi-la (supervisor ou administrador). */
  canSupervise: boolean;
}

export interface ChatFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  scanStatus: 'pending' | 'clean' | 'infected' | 'error' | 'skipped';
  url: string;
  downloadable: boolean;
  isImage: boolean;
}

export interface ChatReplyPreview {
  id: string;
  authorName: string;
  excerpt: string;
  deleted: boolean;
  hasFiles: boolean;
}

export type ChatMessageState = 'sent' | 'sending' | 'failed';

export interface ChatMessage {
  id: string;
  chatId: string;
  authorName: string;
  authorIsInternal: boolean;
  /** Markdown, como o backend guarda. */
  body: string;
  /** HTML sanitizado derivado do markdown (links viram âncoras seguras). */
  bodyHtml: string;
  isSystem: boolean;
  isInternalNote: boolean;
  sentAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  files: ChatFile[];
  editedAt: string | null;
  deleted: boolean;
  canEdit: boolean;
  replyTo: ChatReplyPreview | null;
  /** Só no cliente: mensagem ainda não confirmada pelo servidor. */
  state: ChatMessageState;
}

export interface ChatLink {
  url: string;
  messageId: string;
  sentAt: string;
  authorName: string;
}

export interface ChatMedia {
  files: (ChatFile & { messageId: string; sentAt: string })[];
  links: ChatLink[];
}

export interface ChatCloseReason {
  id: string;
  name: string;
  slug: string;
  requiresNote: boolean;
  active: boolean;
  order: number;
}

export interface ChatQuickReply {
  id: string;
  /** Onde aparece no backend: abrir uma conversa (chat) ou responder a um chamado (ticket). */
  context: 'chat' | 'ticket';
  label: string;
  text: string;
  active: boolean;
  order: number;
}

export interface ChatBannedWord {
  id: string;
  word: string;
}

export interface ChatMacro {
  id: string;
  name: string;
  /** Markdown, como o backend guarda. */
  body: string;
  chatName: string;
  categoryName: string | null;
  priority: ChatPriority | '';
  active: boolean;
}

export interface ChatConfig {
  welcomeMessage: string;
  queueTimeoutMinutes: number;
  maxChatsPerAgent: number;
  scoreMin: number;
  scoreMax: number;
  lowScoreThreshold: number;
  defaultTeamId: string | null;
  defaultTeamName: string | null;
  queueOpen: boolean;
  queueOpensAt: string | null;
  inactivityWarningMinutes: number;
  inactivityCloseMinutes: number;
}

export type ChatConfigInput = Omit<ChatConfig, 'defaultTeamName' | 'queueOpen' | 'queueOpensAt'>;

export type ChatListScope = 'queue' | 'mine' | 'all';

export interface ChatListQuery {
  scope: ChatListScope;
  /** Só em "Todas": filtra por status. */
  status?: ChatStatus;
  q?: string;
  /** Conversas de um cliente (histórico do painel). */
  clientId?: string;
  limit?: number;
  offset?: number;
}

export interface ChatPage {
  count: number;
  results: Chat[];
}

export interface ChatCounts {
  queue: number;
  mine: number;
  all: number;
}

export interface CloseChatInput {
  reasonId?: string | null;
  note?: string;
  agentScore?: number | null;
}

export interface SendChatInput {
  body: string;
  files?: File[];
  internalNote?: boolean;
  replyToId?: string | null;
}

/** Eventos de tempo real de uma sala de chat, já normalizados. */
export type ChatRoomEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'message_edited'; message: ChatMessage }
  | { type: 'message_deleted'; message: ChatMessage }
  | { type: 'delivered'; ids: string[] }
  | { type: 'read'; ids: string[] }
  | { type: 'typing'; userId: string; userName: string; isTyping: boolean }
  | { type: 'accepted'; agentName: string }
  | { type: 'transferred'; agentName: string }
  | { type: 'closed'; byInternal: boolean }
  | { type: 'converted'; ticketId: string; ticketReference: string }
  | { type: 'queue_position'; queue: ChatQueueInfo }
  | { type: 'error'; detail: string };

export interface ChatRoom {
  /** Envia texto pela conexão em tempo real. Devolve `false` se não há conexão aberta (nada foi enviado). */
  sendText: (body: string, opts?: { internalNote?: boolean; replyToId?: string | null }) => boolean;
  sendTyping: (isTyping: boolean) => void;
  sendDelivered: (ids: string[]) => void;
  close: () => void;
}

export interface ChatRoomHandlers {
  onEvent: (ev: ChatRoomEvent) => void;
  /** Conexão aberta. `reconnected` = não é a primeira vez (buscar o que faltou por REST). */
  onOpen?: (info: { reconnected: boolean }) => void;
  onClose?: () => void;
}

/** Eventos da caixa de entrada (canal pessoal): mudanças na fila e novas mensagens. */
export type ChatInboxEvent =
  | { type: 'queued'; chatId: string; clientName: string; company: string }
  | { type: 'taken'; chatId: string }
  | { type: 'message'; chatId: string; preview: string; authorName: string }
  | { type: 'reconnected' };

export interface ChatInboxHandlers {
  onEvent: (ev: ChatInboxEvent) => void;
}
