import type {
  Chat,
  ChatBannedWord,
  ChatCloseReason,
  ChatConfig,
  ChatConfigInput,
  ChatCounts,
  ChatFile,
  ChatInboxHandlers,
  ChatListQuery,
  ChatMacro,
  ChatMedia,
  ChatMessage,
  ChatPage,
  ChatPriority,
  ChatQuickReply,
  ChatRoom,
  ChatRoomEvent,
  ChatRoomHandlers,
  CloseChatInput,
  SendChatInput,
} from '@/types/chat';
import type { CloseReasonInput, MessagesQuery, QuickReplyInput } from '../chatContract';
import { ApiError } from '../errors';
import { markdownToHtml } from '../real/mappers/markdown';
import { ME_ID, minutesAgo } from './data/clock';
import { delay, simulate } from './delay';
import { db } from './db';
import { createTicket } from './tickets';

/**
 * Chat de demonstração (modo mock): conversas de exemplo em memória. As respostas do cliente são simuladas por
 * timers que vivem só enquanto a sala/caixa de entrada está assinada (o cancelamento limpa todos).
 */

const ME_NAME = 'Marina Alves';

interface MockState {
  chats: Chat[];
  messages: Map<string, ChatMessage[]>;
  closeReasons: ChatCloseReason[];
  quickReplies: ChatQuickReply[];
  bannedWords: ChatBannedWord[];
  macros: ChatMacro[];
  config: ChatConfig;
  seq: number;
}

const rooms = new Map<string, Set<ChatRoomHandlers>>();
const inboxes = new Set<ChatInboxHandlers>();

function textMsg(chatId: string, id: number, authorName: string, internal: boolean, body: string, minutes: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: String(id),
    chatId,
    authorName,
    authorIsInternal: internal,
    body,
    bodyHtml: markdownToHtml(body),
    isSystem: false,
    isInternalNote: false,
    sentAt: minutesAgo(minutes),
    readAt: null,
    deliveredAt: null,
    files: [],
    editedAt: null,
    deleted: false,
    canEdit: false,
    replyTo: null,
    state: 'sent',
    ...extra,
  };
}

const systemMsg = (chatId: string, id: number, body: string, minutes: number): ChatMessage =>
  textMsg(chatId, id, 'Sistema', false, body, minutes, { isSystem: true });

function baseChat(id: string, clientId: string, status: Chat['status'], extra: Partial<Chat> = {}): Chat {
  const user = db.users.find((u) => u.id === clientId);
  const org = db.orgs.find((o) => o.id === user?.orgId);
  return {
    id,
    status,
    name: '',
    clientId,
    clientName: user?.name ?? 'Cliente',
    clientEmail: user?.email ?? '',
    clientPhone: '',
    clientAvatar: null,
    companyName: org?.name ?? '',
    agentId: null,
    agentName: null,
    agentAvatar: null,
    categoryName: null,
    priority: 'normal',
    queuedAt: minutesAgo(5),
    acceptedAt: null,
    closedAt: null,
    reopenCount: 0,
    closeReasonId: null,
    closeReasonName: null,
    closeNote: '',
    closedByName: null,
    closedAutomatically: false,
    agentScore: null,
    timeoutConverted: false,
    unreadCount: 0,
    lastMessagePreview: null,
    clientPresence: 'available',
    agentPresence: null,
    rating: null,
    ratingPending: false,
    ticketId: null,
    ticketReference: null,
    queue: null,
    participants: [],
    canSupervise: true,
    ...extra,
  };
}

function seed(): MockState {
  const messages = new Map<string, ChatMessage[]>();
  const put = (id: string, list: ChatMessage[]) => messages.set(id, list);

  put('1', [
    systemMsg('1', 101, 'Olá Thiago, como podemos ajudar?', 6),
    textMsg('1', 102, 'Thiago Barbosa', false, 'Oi! Estou testando a plataforma e não consigo **publicar** a minha primeira página.', 5),
    textMsg('1', 103, 'Thiago Barbosa', false, 'Aparece "domínio não verificado". Podem me ajudar?', 5),
  ]);
  put('2', [
    systemMsg('2', 201, 'Olá Marcelo, como podemos ajudar?', 15),
    textMsg('2', 202, 'Marcelo Dias', false, 'Bom dia, o relatório de entregas está vazio desde ontem. Veja: https://rapidosul.com.br/entregas', 14),
  ]);
  put('3', [
    systemMsg('3', 301, 'Olá Carlos, como podemos ajudar?', 52),
    textMsg('3', 302, 'Carlos Menezes', false, 'Boa tarde! O checkout da loja está recusando todos os cartões.', 50, { readAt: minutesAgo(46) }),
    systemMsg('3', 303, `${ME_NAME} entrou na conversa.`, 47),
    textMsg('3', 304, ME_NAME, true, 'Boa tarde, Carlos! Vou olhar agora. Desde quando acontece?', 46, { readAt: minutesAgo(40), deliveredAt: minutesAgo(45) }),
    textMsg('3', 305, 'Carlos Menezes', false, 'Desde as 14h. Segue o print do erro.', 44, {
      readAt: minutesAgo(40),
      files: [{ id: 'f1', name: 'erro-checkout.txt', contentType: 'text/plain', size: 2048, scanStatus: 'clean', url: 'data:text/plain;charset=utf-8,Falha%20no%20pagamento%20%28codigo%2051%29', downloadable: true, isImage: false }],
    }),
    textMsg('3', 306, ME_NAME, true, 'Encontrei: o gateway expirou a credencial. Já abri um chamado interno para renovar.', 38, { isInternalNote: true, deliveredAt: minutesAgo(38) }),
    textMsg('3', 307, ME_NAME, true, 'Pode testar de novo agora? Renovei a credencial.', 12, { deliveredAt: minutesAgo(12) }),
    textMsg('3', 308, 'Carlos Menezes', false, 'Testando...', 3),
  ]);
  put('4', [
    systemMsg('4', 401, 'Olá Juliana, como podemos ajudar?', 25),
    textMsg('4', 402, 'Juliana Castro', false, 'Preciso trocar o e-mail de cobrança da clínica.', 24, { readAt: minutesAgo(20) }),
    systemMsg('4', 403, `${ME_NAME} entrou na conversa.`, 21),
    textMsg('4', 404, ME_NAME, true, 'Claro, Juliana. Qual é o novo e-mail?', 20, { deliveredAt: minutesAgo(19) }),
  ]);
  put('5', [
    systemMsg('5', 501, 'Olá Fernanda, como podemos ajudar?', 90),
    textMsg('5', 502, 'Fernanda Lopes', false, 'Minha nota fiscal de setembro saiu com o CNPJ errado.', 88, { readAt: minutesAgo(80) }),
    systemMsg('5', 503, 'Rafael Pinto entrou na conversa.', 85),
    textMsg('5', 504, 'Rafael Pinto', true, 'Vou reemitir a nota. Você consegue me confirmar o CNPJ correto?', 84, { readAt: minutesAgo(70), deliveredAt: minutesAgo(83) }),
    textMsg('5', 505, 'Fernanda Lopes', false, 'É o 12.345.678/0001-90.', 30),
  ]);
  put('6', [
    systemMsg('6', 601, 'Olá Ricardo, como podemos ajudar?', 400),
    textMsg('6', 602, 'Ricardo Tavares', false, 'Como exporto os pedidos em planilha?', 399, { readAt: minutesAgo(395) }),
    textMsg('6', 603, ME_NAME, true, 'Em Pedidos > Exportar, escolha o período e o formato.', 396, { readAt: minutesAgo(390), deliveredAt: minutesAgo(395) }),
    textMsg('6', 604, 'Ricardo Tavares', false, 'Funcionou, obrigado!', 390, { readAt: minutesAgo(389) }),
    systemMsg('6', 605, 'Conversa encerrada.', 388),
  ]);
  put('7', [
    systemMsg('7', 701, 'Olá Beatriz, como podemos ajudar?', 1500),
    textMsg('7', 702, 'Beatriz Furtado', false, 'Esqueci a senha do painel.', 1499, { readAt: minutesAgo(1490) }),
    textMsg('7', 703, ME_NAME, true, 'Enviei o link de redefinição para o seu e-mail.', 1495, { readAt: minutesAgo(1490), deliveredAt: minutesAgo(1494) }),
    systemMsg('7', 704, 'Conversa encerrada.', 1480),
  ]);
  put('8', [
    systemMsg('8', 801, 'Olá Patrícia, como podemos ajudar?', 3000),
    textMsg('8', 802, 'Patrícia Gomes', false, 'Preciso de uma integração personalizada com o nosso ERP.', 2999, { readAt: minutesAgo(2990) }),
    textMsg('8', 803, ME_NAME, true, 'Vou transformar isto em um ticket para a equipe de integrações.', 2995, { readAt: minutesAgo(2990), deliveredAt: minutesAgo(2994) }),
    systemMsg('8', 804, 'Conversa encerrada.', 2985),
  ]);

  const chats: Chat[] = [
    baseChat('1', 'u9', 'queued', { queuedAt: minutesAgo(6), queue: { position: 1, ahead: 0, estimatedWaitMinutes: 3, queueOpen: true, queueOpensAt: null }, unreadCount: 2, lastMessagePreview: 'Aparece "domínio não verificado". Podem me ajudar?', clientPhone: '(11) 99999-0009' }),
    baseChat('2', 'u7', 'queued', { queuedAt: minutesAgo(15), queue: { position: 2, ahead: 1, estimatedWaitMinutes: 6, queueOpen: true, queueOpensAt: null }, unreadCount: 1, lastMessagePreview: 'Bom dia, o relatório de entregas está vazio desde ontem. Veja: https://rapidosul.com.br/entregas' }),
    baseChat('3', 'u1', 'active', { name: 'Checkout recusando cartões', queuedAt: minutesAgo(52), acceptedAt: minutesAgo(47), agentId: ME_ID, agentName: ME_NAME, agentPresence: 'available', unreadCount: 1, lastMessagePreview: 'Testando...', priority: 'high', categoryName: 'Incidente', clientPhone: '(11) 98888-0001' }),
    baseChat('4', 'u4', 'active', { queuedAt: minutesAgo(25), acceptedAt: minutesAgo(21), agentId: ME_ID, agentName: ME_NAME, agentPresence: 'available', lastMessagePreview: 'Claro, Juliana. Qual é o novo e-mail?' }),
    baseChat('5', 'u2', 'active', { queuedAt: minutesAgo(90), acceptedAt: minutesAgo(86), agentId: 'a2', agentName: 'Rafael Pinto', agentPresence: 'away', unreadCount: 1, lastMessagePreview: 'É o 12.345.678/0001-90.' }),
    baseChat('6', 'u3', 'closed', {
      queuedAt: minutesAgo(400), acceptedAt: minutesAgo(398), closedAt: minutesAgo(388), agentId: ME_ID, agentName: ME_NAME, agentPresence: 'available', closedByName: ME_NAME,
      closeReasonId: '1', closeReasonName: 'Resolvido', lastMessagePreview: 'Funcionou, obrigado!', clientPresence: 'offline',
      rating: { serviceScore: 10, resolutionScore: 9, justification: '', createdAt: minutesAgo(385) },
    }),
    baseChat('7', 'u6', 'closed', {
      queuedAt: minutesAgo(1500), acceptedAt: minutesAgo(1498), closedAt: minutesAgo(1480), agentId: ME_ID, agentName: ME_NAME, closedByName: ME_NAME, agentPresence: 'available',
      closeReasonId: '1', closeReasonName: 'Resolvido', lastMessagePreview: 'Enviei o link de redefinição para o seu e-mail.', ratingPending: true, clientPresence: 'offline',
    }),
    baseChat('8', 'u8', 'closed', {
      queuedAt: minutesAgo(3000), acceptedAt: minutesAgo(2998), closedAt: minutesAgo(2985), agentId: ME_ID, agentName: ME_NAME, closedByName: ME_NAME, agentPresence: 'available',
      closeReasonId: '5', closeReasonName: 'Virou ticket', ticketId: '1', ticketReference: '#1', lastMessagePreview: 'Vou transformar isto em um ticket para a equipe de integrações.', clientPresence: 'offline',
    }),
  ];

  return {
    chats,
    messages,
    seq: 1000,
    closeReasons: [
      { id: '1', name: 'Resolvido', slug: 'resolvido', requiresNote: false, active: true, order: 0 },
      { id: '2', name: 'Sem resposta do cliente', slug: 'sem-resposta-do-cliente', requiresNote: false, active: true, order: 1 },
      { id: '3', name: 'Cliente desistiu', slug: 'cliente-desistiu', requiresNote: false, active: true, order: 2 },
      { id: '4', name: 'Duplicado', slug: 'duplicado', requiresNote: false, active: true, order: 3 },
      { id: '5', name: 'Virou ticket', slug: 'virou-ticket', requiresNote: false, active: true, order: 4 },
      { id: '6', name: 'Outro', slug: 'outro', requiresNote: true, active: true, order: 5 },
    ],
    quickReplies: [
      { id: '1', context: 'chat', label: 'Problema com um pedido', text: 'Estou com um problema no pedido nº ', active: true, order: 0 },
      { id: '2', context: 'chat', label: 'Erro na integração', text: 'A integração parou de funcionar. O erro que aparece é: ', active: true, order: 1 },
      { id: '3', context: 'ticket', label: 'Ainda estou com o problema', text: 'O problema continua acontecendo. ', active: true, order: 0 },
    ],
    bannedWords: [{ id: '1', word: 'palavrão' }],
    macros: [
      { id: '1', name: 'Pedir mais informação', body: 'Olá, {{solicitante}}! Para seguir com este atendimento preciso de mais um detalhe:\n\n- \n\nAssim que você responder, retomo daqui.', chatName: '', categoryName: 'Dúvida', priority: '', active: true },
      { id: '2', name: 'Cumprimento', body: 'Oi, {{solicitante}}! Já estou vendo aqui. Um minuto.', chatName: 'Atendimento · {{empresa}}', categoryName: null, priority: '', active: true },
      { id: '3', name: 'Encerramento educado', body: 'Fico feliz em ter ajudado, {{solicitante}}! Se precisar de algo mais, é só chamar por aqui.', chatName: '', categoryName: null, priority: 'low', active: true },
    ],
    config: {
      welcomeMessage: 'Olá {{nome_do_cliente}}, como podemos ajudar?',
      queueTimeoutMinutes: 10,
      maxChatsPerAgent: 3,
      scoreMin: 0,
      scoreMax: 10,
      lowScoreThreshold: 5,
      defaultTeamId: 'g1',
      defaultTeamName: 'Suporte N1',
      queueOpen: true,
      queueOpensAt: null,
      inactivityWarningMinutes: 0,
      inactivityCloseMinutes: 0,
    },
  };
}

let state: MockState = seed();

/** Volta a demonstração ao estado inicial (testes). Cancela timers e assinaturas pendentes. */
export function resetChatMock(): void {
  rooms.clear();
  inboxes.clear();
  state = seed();
}

/* --------------------------------- helpers -------------------------------- */

const find = (id: string): Chat => {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) throw new ApiError('Conversa não encontrada.', { status: 404 });
  return chat;
};

function patch(id: string, p: Partial<Chat>): Chat {
  const i = state.chats.findIndex((c) => c.id === id);
  if (i < 0) throw new ApiError('Conversa não encontrada.', { status: 404 });
  state.chats[i] = { ...state.chats[i]!, ...p };
  return state.chats[i]!;
}

const msgsOf = (id: string): ChatMessage[] => {
  const list = state.messages.get(id);
  if (list) return list;
  const created: ChatMessage[] = [];
  state.messages.set(id, created);
  return created;
};

const nextId = (): number => ++state.seq;

function emit(chatId: string, ev: ChatRoomEvent): void {
  rooms.get(chatId)?.forEach((h) => h.onEvent(ev));
}

function emitInbox(ev: Parameters<ChatInboxHandlers['onEvent']>[0]): void {
  inboxes.forEach((h) => h.onEvent(ev));
}

function pushMessage(chatId: string, message: ChatMessage, opts: { fromClient?: boolean } = {}): ChatMessage {
  msgsOf(chatId).push(message);
  const chat = find(chatId);
  const preview = message.body || (message.files[0] ? `Anexo: ${message.files[0].name}` : '');
  if (!message.isSystem && !message.isInternalNote) {
    patch(chatId, { lastMessagePreview: preview.slice(0, 90), unreadCount: opts.fromClient ? chat.unreadCount + 1 : chat.unreadCount });
  }
  emit(chatId, { type: 'message', message });
  return message;
}

const hasLiveAgent = (c: Chat): boolean => c.status === 'active';

function visibleMessages(id: string): ChatMessage[] {
  return msgsOf(id).map((m) => ({ ...m }));
}

/* ---------------------------------- leitura -------------------------------- */

export function listChats(q: ChatListQuery): Promise<ChatPage> {
  return simulate(() => {
    const term = q.q?.trim().toLowerCase();
    let list = state.chats.filter((c) => {
      if (q.clientId && c.clientId !== q.clientId) return false;
      if (q.scope === 'queue') return c.status === 'queued';
      if (q.scope === 'mine') return c.status === 'active' && c.agentId === ME_ID;
      return !q.status || c.status === q.status;
    });
    if (term) {
      list = list.filter(
        (c) =>
          c.clientName.toLowerCase().includes(term) ||
          c.companyName.toLowerCase().includes(term) ||
          c.clientEmail.toLowerCase().includes(term) ||
          c.name.toLowerCase().includes(term) ||
          `#${c.id}` === term ||
          msgsOf(c.id).some((m) => !m.deleted && m.body.toLowerCase().includes(term)),
      );
    }
    list = [...list].sort((a, b) => (q.scope === 'queue' ? a.queuedAt.localeCompare(b.queuedAt) : b.queuedAt.localeCompare(a.queuedAt)));
    if (q.scope === 'queue') list = list.map((c, i) => ({ ...c, queue: { position: i + 1, ahead: i, estimatedWaitMinutes: (i + 1) * 3, queueOpen: true, queueOpensAt: null } }));
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    return { count: list.length, results: list.slice(offset, offset + limit).map((c) => ({ ...c })) };
  });
}

export function getChatCounts(): Promise<ChatCounts> {
  return simulate(() => ({
    queue: state.chats.filter((c) => c.status === 'queued').length,
    mine: state.chats.filter((c) => c.status === 'active' && c.agentId === ME_ID).length,
    all: state.chats.length,
  }));
}

export function getChat(id: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status !== 'queued') return { ...chat };
    const queued = state.chats.filter((c) => c.status === 'queued').sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    const i = queued.findIndex((c) => c.id === id);
    return { ...chat, queue: { position: i + 1, ahead: i, estimatedWaitMinutes: (i + 1) * 3, queueOpen: true, queueOpensAt: null } };
  });
}

export function listMessages(chatId: string, query: MessagesQuery = {}): Promise<ChatMessage[]> {
  return simulate(() => {
    find(chatId);
    let list = visibleMessages(chatId);
    if (query.after) list = list.filter((m) => Number(m.id) > Number(query.after));
    if (query.before) list = list.filter((m) => Number(m.id) < Number(query.before));
    if (query.limit) list = list.slice(-query.limit);
    return list;
  });
}

export function getChatMedia(chatId: string): Promise<ChatMedia> {
  return simulate(() => {
    const files = msgsOf(chatId).flatMap((m) => m.files.map((f) => ({ ...f, messageId: m.id, sentAt: m.sentAt })));
    const links = msgsOf(chatId).flatMap((m) =>
      (m.body.match(/https?:\/\/[^\s)]+/g) ?? []).map((url) => ({ url, messageId: m.id, sentAt: m.sentAt, authorName: m.authorName })),
    );
    return { files, links };
  });
}

/* ---------------------------------- escrita -------------------------------- */

export function sendFiles(chatId: string, input: SendChatInput): Promise<ChatMessage> {
  return simulate(() => {
    const chat = find(chatId);
    if (chat.status !== 'active') throw new ApiError('Este chat não aceita mensagens suas agora.', { status: 400 });
    const files: ChatFile[] = (input.files ?? []).map((f, i) => ({
      id: `f${nextId()}-${i}`,
      name: f.name,
      contentType: f.type || 'application/octet-stream',
      size: f.size,
      scanStatus: 'clean',
      url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '',
      downloadable: typeof URL.createObjectURL === 'function',
      isImage: /^image\/(png|jpe?g|gif|webp)$/i.test(f.type),
    }));
    const message = textMsg(chatId, nextId(), ME_NAME, true, input.body.trim(), 0, { files, isInternalNote: Boolean(input.internalNote), sentAt: new Date().toISOString() });
    pushMessage(chatId, message);
    scheduleClientReply(chatId);
    return { ...message };
  });
}

export function editMessage(chatId: string, messageId: string, body: string): Promise<ChatMessage> {
  return simulate(() => {
    const list = msgsOf(chatId);
    const i = list.findIndex((m) => m.id === messageId);
    if (i < 0) throw new ApiError('Mensagem não encontrada neste chat.', { status: 404 });
    if (!list[i]!.authorIsInternal || list[i]!.authorName !== ME_NAME || i !== list.length - 1) throw new ApiError('Só a sua última mensagem pode ser editada.', { status: 400 });
    list[i] = { ...list[i]!, body, bodyHtml: markdownToHtml(body), editedAt: new Date().toISOString() };
    emit(chatId, { type: 'message_edited', message: list[i]! });
    return { ...list[i]! };
  });
}

export function deleteMessage(chatId: string, messageId: string): Promise<ChatMessage> {
  return simulate(() => {
    const list = msgsOf(chatId);
    const i = list.findIndex((m) => m.id === messageId);
    if (i < 0) throw new ApiError('Mensagem não encontrada neste chat.', { status: 404 });
    if (!list[i]!.authorIsInternal || list[i]!.authorName !== ME_NAME || i !== list.length - 1) throw new ApiError('Só a sua última mensagem pode ser apagada.', { status: 400 });
    list[i] = { ...list[i]!, body: '', bodyHtml: '', files: [], deleted: true };
    emit(chatId, { type: 'message_deleted', message: list[i]! });
    return { ...list[i]! };
  });
}

export function markRead(chatId: string): Promise<void> {
  return simulate(() => {
    const now = new Date().toISOString();
    state.messages.set(chatId, msgsOf(chatId).map((m) => (!m.authorIsInternal && !m.isSystem && !m.readAt ? { ...m, readAt: now } : m)));
    patch(chatId, { unreadCount: 0 });
  });
}

function system(chatId: string, body: string): void {
  pushMessage(chatId, systemMsg(chatId, nextId(), body, 0));
}

export function takeChat(id: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status !== 'queued') throw new ApiError('Este chat já foi pego por outro agente.', { status: 400 });
    if (state.chats.filter((c) => c.status === 'active' && c.agentId === ME_ID).length >= state.config.maxChatsPerAgent) {
      throw new ApiError(`Você já está no limite de ${state.config.maxChatsPerAgent} chats simultâneos.`, { status: 400 });
    }
    const next = patch(id, { status: 'active', agentId: ME_ID, agentName: ME_NAME, agentPresence: 'available', acceptedAt: new Date().toISOString(), queue: null });
    system(id, `${ME_NAME} entrou na conversa.`);
    emit(id, { type: 'accepted', agentName: ME_NAME });
    emitInbox({ type: 'taken', chatId: id });
    return { ...next };
  });
}

export function joinChat(id: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status !== 'active') throw new ApiError('Só dá para entrar numa conversa em atendimento.', { status: 400 });
    if (chat.agentId === ME_ID) throw new ApiError('Esta conversa já é sua.', { status: 400 });
    if (chat.participants.some((p) => p.id === ME_ID)) throw new ApiError('Você já está nesta conversa.', { status: 400 });
    const next = patch(id, { participants: [...chat.participants, { id: ME_ID, name: ME_NAME }] });
    system(id, `${ME_NAME} entrou na conversa.`);
    return { ...next };
  });
}

export function leaveChat(id: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (!chat.participants.some((p) => p.id === ME_ID)) throw new ApiError('Você não está participando desta conversa.', { status: 400 });
    const next = patch(id, { participants: chat.participants.filter((p) => p.id !== ME_ID) });
    if (chat.status === 'active') system(id, `${ME_NAME} saiu da conversa.`);
    return { ...next };
  });
}

export function assumeChat(id: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status !== 'active') throw new ApiError('Só dá para assumir uma conversa em atendimento.', { status: 400 });
    if (chat.agentId === ME_ID) throw new ApiError('Esta conversa já é sua.', { status: 400 });
    const before = chat.agentName;
    const next = patch(id, { agentId: ME_ID, agentName: ME_NAME, participants: chat.participants.filter((p) => p.id !== ME_ID) });
    system(id, before ? `${ME_NAME} assumiu o atendimento de ${before}.` : `${ME_NAME} assumiu a conversa.`);
    emit(id, { type: 'transferred', agentName: ME_NAME });
    return { ...next };
  });
}

export function transferChat(id: string, agentId: string, _note = ''): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    const to = db.users.find((u) => u.id === agentId && u.role !== 'end_user');
    if (!to) throw new ApiError('Agente não encontrado.', { status: 400, fieldErrors: { agent_id: ['Agente não encontrado.'] } });
    if (chat.status !== 'active') throw new ApiError('Só dá para transferir um chat em atendimento.', { status: 400 });
    if (chat.agentId !== ME_ID) throw new ApiError('Só quem está atendendo (ou um admin) transfere.', { status: 400 });
    if (chat.agentId === to.id) throw new ApiError(`O chat já é de ${to.name}.`, { status: 400 });
    const next = patch(id, { agentId: to.id, agentName: to.name, participants: chat.participants.filter((p) => p.id !== to.id) });
    system(id, `Atendimento transferido de ${chat.agentName ?? ME_NAME} para ${to.name}.`);
    emit(id, { type: 'transferred', agentName: to.name });
    return { ...next };
  });
}

export function closeChat(id: string, input: CloseChatInput = {}): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status === 'closed') throw new ApiError('Este chat já está encerrado.', { status: 400 });
    const reason = input.reasonId ? state.closeReasons.find((r) => r.id === input.reasonId && r.active) : undefined;
    if (input.reasonId && !reason) throw new ApiError('Motivo de encerramento não encontrado.', { status: 400 });
    if (reason?.requiresNote && !input.note?.trim()) throw new ApiError(`O motivo "${reason.name}" pede uma observação interna.`, { status: 400 });
    const next = patch(id, {
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedByName: ME_NAME,
      closeReasonId: reason?.id ?? null,
      closeReasonName: reason?.name ?? null,
      closeNote: input.note?.trim() ?? '',
      agentScore: input.agentScore ?? null,
      ratingPending: true,
      queue: null,
    });
    system(id, 'Conversa encerrada.');
    emit(id, { type: 'closed', byInternal: true });
    emitInbox({ type: 'taken', chatId: id });
    return { ...next };
  });
}

export function reopenChat(id: string, _note = ''): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.status !== 'closed') throw new ApiError('Só um chat encerrado pode ser reaberto.', { status: 400 });
    if (chat.ticketId) throw new ApiError('Este chat virou um ticket. A conversa continua por lá.', { status: 400 });
    const next = patch(id, { status: 'queued', agentId: null, agentName: null, acceptedAt: null, closedAt: null, closedByName: null, closeReasonId: null, closeReasonName: null, closeNote: '', reopenCount: chat.reopenCount + 1, queuedAt: new Date().toISOString(), ratingPending: false });
    system(id, 'Conversa reaberta, aguardando atendimento.');
    emitInbox({ type: 'queued', chatId: id, clientName: chat.clientName, company: chat.companyName });
    return { ...next };
  });
}

export async function convertChat(id: string, teamId: string): Promise<Chat> {
  await delay();
  return (async () => {
      const chat = find(id);
      if (chat.ticketId) return { ...chat };
      const transcript = msgsOf(id)
        .filter((m) => !m.isSystem && !m.isInternalNote && !m.deleted)
        .map((m) => `<p><strong>${m.authorName}:</strong> ${m.bodyHtml.replace(/^<p>|<\/p>$/g, '')}</p>`)
        .join('');
      const ticket = await createTicket({
        subject: chat.name || `Chat com ${chat.clientName}`,
        requesterId: chat.clientId,
        bodyHtml: transcript || '<p>Conversa de chat.</p>',
        assigneeGroupId: db.groups.some((g) => g.id === teamId) ? teamId : undefined,
        assigneeId: ME_ID,
        channel: 'web_form',
      });
      const closed = chat.status === 'closed';
      const next = patch(id, { ticketId: String(ticket.id), ticketReference: `#${ticket.id}`, ...(closed ? {} : { status: 'closed' as const, closedAt: new Date().toISOString(), closedByName: ME_NAME, closeReasonName: 'Virou ticket' }), queue: null });
      if (!closed) {
        system(id, 'Conversa encerrada.');
        emit(id, { type: 'closed', byInternal: true });
      }
      emit(id, { type: 'converted', ticketId: String(ticket.id), ticketReference: `#${ticket.id}` });
      return { ...next };
  })();
}

export function applyMacro(id: string, macroId: string): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    const macro = state.macros.find((m) => m.id === macroId && m.active);
    if (!macro) throw new ApiError('Macro não encontrada.', { status: 400 });
    const p: Partial<Chat> = {};
    if (macro.chatName && !chat.name) p.name = macro.chatName.replace('{{empresa}}', chat.companyName);
    if (macro.priority) p.priority = macro.priority;
    if (macro.categoryName) p.categoryName = macro.categoryName;
    return { ...patch(id, p) };
  });
}

export function updateChat(id: string, input: { name?: string; priority?: ChatPriority }): Promise<Chat> {
  return simulate(() => {
    const chat = find(id);
    if (chat.agentId !== ME_ID) throw new ApiError('Só quem está atendendo edita o atendimento.', { status: 403 });
    return { ...patch(id, { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.priority ? { priority: input.priority } : {}) }) };
  });
}

export function exportChat(id: string, withNotes: boolean): Promise<{ blob: Blob; fileName: string }> {
  return simulate(() => {
    const chat = find(id);
    const lines = msgsOf(id)
      .filter((m) => withNotes || !m.isInternalNote)
      .map((m) => `[${new Date(m.sentAt).toLocaleString('pt-BR')}] ${m.authorName}${m.isInternalNote ? ' (nota interna)' : ''}: ${m.body}`);
    return { blob: new Blob([`Conversa #${chat.id} com ${chat.clientName}\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' }), fileName: `chat-${chat.id}.txt` };
  });
}

/* -------------------------------- cadastros -------------------------------- */

export const listChatMacros = (): Promise<ChatMacro[]> => simulate(() => state.macros.map((m) => ({ ...m })));
export const listCloseReasons = (): Promise<ChatCloseReason[]> => simulate(() => state.closeReasons.map((r) => ({ ...r })));

export function saveCloseReason(input: CloseReasonInput): Promise<ChatCloseReason> {
  return simulate(() => {
    const name = input.name.trim();
    if (!name) throw new ApiError('Informe o nome do motivo.', { status: 400, fieldErrors: { name: ['Informe o nome do motivo.'] } });
    if (state.closeReasons.some((r) => r.id !== input.id && r.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError('Já existe um motivo com este nome.', { status: 400, fieldErrors: { name: ['Já existe um motivo com este nome.'] } });
    }
    const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const saved: ChatCloseReason = { id: input.id ?? String(nextId()), name, slug, requiresNote: input.requiresNote, active: input.active, order: input.order ?? state.closeReasons.length };
    state.closeReasons = input.id ? state.closeReasons.map((r) => (r.id === input.id ? saved : r)) : [...state.closeReasons, saved];
    return { ...saved };
  });
}

export function deleteCloseReason(id: string): Promise<void> {
  return simulate(() => {
    if (state.chats.some((c) => c.closeReasonId === id)) throw new ApiError('Este motivo já foi usado em atendimentos e não pode ser apagado. Desative-o.', { status: 409 });
    state.closeReasons = state.closeReasons.filter((r) => r.id !== id);
  });
}

export const listQuickReplies = (): Promise<ChatQuickReply[]> => simulate(() => state.quickReplies.map((r) => ({ ...r })));

export function saveQuickReply(input: QuickReplyInput): Promise<ChatQuickReply> {
  return simulate(() => {
    const label = input.label.trim();
    if (!label) throw new ApiError('Informe o rótulo.', { status: 400, fieldErrors: { rotulo: ['Informe o rótulo.'] } });
    if (state.quickReplies.some((r) => r.id !== input.id && r.context === input.context && r.label.toLowerCase() === label.toLowerCase())) {
      throw new ApiError('Já existe uma resposta com este rótulo neste contexto.', { status: 400, fieldErrors: { rotulo: ['Já existe uma resposta com este rótulo neste contexto.'] } });
    }
    const saved: ChatQuickReply = { id: input.id ?? String(nextId()), context: input.context, label, text: input.text, active: input.active, order: input.order ?? state.quickReplies.length };
    state.quickReplies = input.id ? state.quickReplies.map((r) => (r.id === input.id ? saved : r)) : [...state.quickReplies, saved];
    return { ...saved };
  });
}

export function deleteQuickReply(id: string): Promise<void> {
  return simulate(() => {
    state.quickReplies = state.quickReplies.filter((r) => r.id !== id);
  });
}

export const listBannedWords = (): Promise<ChatBannedWord[]> => simulate(() => state.bannedWords.map((w) => ({ ...w })).sort((a, b) => a.word.localeCompare(b.word, 'pt-BR')));

export function addBannedWord(word: string): Promise<ChatBannedWord> {
  return simulate(() => {
    const value = word.trim().toLowerCase();
    if (!value) throw new ApiError('Informe a palavra.', { status: 400, fieldErrors: { word: ['Informe a palavra.'] } });
    if (state.bannedWords.some((w) => w.word === value)) throw new ApiError('Esta palavra já está na lista.', { status: 400, fieldErrors: { word: ['Esta palavra já está na lista.'] } });
    const saved = { id: String(nextId()), word: value };
    state.bannedWords = [...state.bannedWords, saved];
    return { ...saved };
  });
}

export function deleteBannedWord(id: string): Promise<void> {
  return simulate(() => {
    state.bannedWords = state.bannedWords.filter((w) => w.id !== id);
  });
}

export const getChatConfig = (): Promise<ChatConfig> => simulate(() => ({ ...state.config }));

export function saveChatConfig(input: ChatConfigInput): Promise<ChatConfig> {
  return simulate(() => {
    if (input.scoreMin >= input.scoreMax) throw new ApiError('O máximo da escala precisa ser maior que o mínimo.', { status: 400, fieldErrors: { score_max: ['O máximo da escala precisa ser maior que o mínimo.'] } });
    if (input.lowScoreThreshold < input.scoreMin || input.lowScoreThreshold > input.scoreMax) {
      throw new ApiError('O gatilho da justificativa precisa caber na escala.', { status: 400, fieldErrors: { low_score_threshold: ['O gatilho da justificativa precisa caber na escala.'] } });
    }
    if (input.inactivityWarningMinutes && input.inactivityCloseMinutes && input.inactivityWarningMinutes >= input.inactivityCloseMinutes) {
      throw new ApiError('O aviso precisa vir antes do encerramento. Use um tempo menor.', { status: 400, fieldErrors: { inactivity_warning_minutes: ['O aviso precisa vir antes do encerramento. Use um tempo menor.'] } });
    }
    const team = db.groups.find((g) => g.id === input.defaultTeamId);
    state.config = { ...state.config, ...input, defaultTeamName: team?.name ?? null };
    return { ...state.config };
  });
}

/* ------------------------------- tempo real -------------------------------- */

const REPLIES = [
  'Entendi, obrigado! Vou aguardar.',
  'Perfeito, pode seguir.',
  'Acabei de tentar de novo e continua igual.',
  'Consegue me passar o passo a passo?',
  'Ótimo, deu certo por aqui!',
  'Posso mandar um print se ajudar.',
];

const CLIENT_DELAY_MS = 4000;
const TYPING_MS = 1800;
const SPONTANEOUS_MS = 25_000;
const NEW_QUEUE_MS = 45_000;
const MAX_QUEUE = 4;

const clientTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function clearClientTimers(chatId: string): void {
  clientTimers.get(chatId)?.forEach(clearTimeout);
  clientTimers.delete(chatId);
}

/** O cliente "digita" e responde alguns segundos depois da mensagem do agente. Só enquanto a sala está aberta. */
function scheduleClientReply(chatId: string): void {
  if (!rooms.get(chatId)?.size) return;
  const chat = find(chatId);
  if (!hasLiveAgent(chat) || chat.agentId !== ME_ID) return;
  clearClientTimers(chatId);
  const timers: ReturnType<typeof setTimeout>[] = [];
  timers.push(
    setTimeout(() => emit(chatId, { type: 'typing', userId: chat.clientId, userName: chat.clientName, isTyping: true }), CLIENT_DELAY_MS - TYPING_MS),
    setTimeout(() => {
      emit(chatId, { type: 'typing', userId: chat.clientId, userName: chat.clientName, isTyping: false });
      const live = state.chats.find((c) => c.id === chatId);
      if (!live || live.status !== 'active') return;
      const body = REPLIES[Math.floor(Math.random() * REPLIES.length)]!;
      pushMessage(chatId, textMsg(chatId, nextId(), live.clientName, false, body, 0, { sentAt: new Date().toISOString() }), { fromClient: true });
    }, CLIENT_DELAY_MS),
  );
  clientTimers.set(chatId, timers);
}

export function openRoom(chatId: string, handlers: ChatRoomHandlers): ChatRoom {
  const set = rooms.get(chatId) ?? new Set<ChatRoomHandlers>();
  set.add(handlers);
  rooms.set(chatId, set);
  let closed = false;
  const pending: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms = 0) => {
    pending.push(
      setTimeout(() => {
        if (!closed) fn();
      }, ms),
    );
  };
  later(() => handlers.onOpen?.({ reconnected: false }));
  // Quando o último a falar foi o agente e o cliente demora, ele volta sozinho de tempos em tempos.
  const spontaneous = setInterval(() => {
    const chat = state.chats.find((c) => c.id === chatId);
    const last = msgsOf(chatId).filter((m) => !m.isSystem && !m.isInternalNote).at(-1);
    if (chat?.status === 'active' && chat.agentId === ME_ID && last?.authorIsInternal && Date.now() - new Date(last.sentAt).getTime() > SPONTANEOUS_MS) scheduleClientReply(chatId);
  }, SPONTANEOUS_MS);
  return {
    sendText: (body, opts = {}) => {
      if (closed) return false;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat || chat.status !== 'active') {
        later(() => handlers.onEvent({ type: 'error', detail: 'Este chat não aceita mensagens suas agora.' }));
        return true;
      }
      later(() => {
        const note = Boolean(opts.internalNote);
        const reply = opts.replyToId ? msgsOf(chatId).find((m) => m.id === opts.replyToId) : undefined;
        pushMessage(
          chatId,
          textMsg(chatId, nextId(), ME_NAME, true, body.trim(), 0, {
            sentAt: new Date().toISOString(),
            isInternalNote: note,
            deliveredAt: note ? null : new Date().toISOString(),
            replyTo: reply ? { id: reply.id, authorName: reply.authorName, excerpt: reply.body.slice(0, 160), deleted: reply.deleted, hasFiles: reply.files.length > 0 } : null,
          }),
        );
        if (!note) scheduleClientReply(chatId);
      });
      return true;
    },
    sendTyping: () => undefined,
    sendDelivered: () => undefined,
    close: () => {
      closed = true;
      pending.forEach(clearTimeout);
      clearInterval(spontaneous);
      clearClientTimers(chatId);
      set.delete(handlers);
      if (set.size === 0) rooms.delete(chatId);
    },
  };
}

const NEWCOMERS = ['u5', 'u10', 'u12', 'u11'];

export function subscribeInbox(handlers: ChatInboxHandlers): () => void {
  inboxes.add(handlers);
  // De tempos em tempos entra alguém na fila, como no atendimento de verdade.
  const timer = setInterval(() => {
    const waiting = state.chats.filter((c) => c.status === 'queued');
    if (waiting.length >= MAX_QUEUE) return;
    const clientId = NEWCOMERS.find((u) => !state.chats.some((c) => c.clientId === u && c.status !== 'closed'));
    if (!clientId) return;
    const id = String(nextId());
    const chat = baseChat(id, clientId, 'queued', { queuedAt: new Date().toISOString(), unreadCount: 1, lastMessagePreview: 'Olá, preciso de ajuda.' });
    state.chats.push(chat);
    state.messages.set(id, [systemMsg(id, nextId(), `Olá ${chat.clientName.split(' ')[0]}, como podemos ajudar?`, 0), textMsg(id, nextId(), chat.clientName, false, 'Olá, preciso de ajuda.', 0, { sentAt: new Date().toISOString() })]);
    emitInbox({ type: 'queued', chatId: id, clientName: chat.clientName, company: chat.companyName });
  }, NEW_QUEUE_MS);
  return () => {
    inboxes.delete(handlers);
    clearInterval(timer);
  };
}
