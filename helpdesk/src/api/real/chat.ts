import type { CloseReasonInput, MessagesQuery, QuickReplyInput } from '../chatContract';
import { ApiError } from '../errors';
import type { Chat, ChatBannedWord, ChatCloseReason, ChatConfig, ChatConfigInput, ChatCounts, ChatInboxHandlers, ChatListQuery, ChatMacro, ChatMedia, ChatMessage, ChatPage, ChatPriority, ChatQuickReply, ChatRoom, ChatRoomHandlers, CloseChatInput, SendChatInput } from '@/types/chat';
import { apiBaseUrl, http, toApiError, type Paginated } from './http';
import {
  chatConfigToDto,
  mapBannedWord,
  mapChat,
  mapChatConfig,
  mapChatMacro,
  mapChatMedia,
  mapChatMessage,
  mapCloseReason,
  mapQuickReply,
  mapRoomEvent,
  type ChatBannedWordDto,
  type ChatCloseReasonDto,
  type ChatConfigDto,
  type ChatDto,
  type ChatMacroDto,
  type ChatMediaDto,
  type ChatMessageDto,
  type ChatQuickReplyDto,
} from './mappers/chat';
import { ChatSocket, getMeSocket } from './ws';

/**
 * CHAT (`/api/v1/chat/*`): tudo vai ao backend; nada fica só no navegador. O texto de uma mensagem NÃO tem rota REST
 * (o backend o recebe pelo WebSocket da sala, `ws/chat/<id>/`); só o anexo sobe por REST. Mensagens são markdown.
 */

const base = (id: string) => `/chat/chats/${encodeURIComponent(id)}`;
const asArray = <T>(v: Paginated<T> | T[]): T[] => (Array.isArray(v) ? v : v.results);

export async function listChats(q: ChatListQuery): Promise<ChatPage> {
  const query: Record<string, string | number | undefined> = { limit: q.limit ?? 50, offset: q.offset, q: q.q?.trim() || undefined, client: q.clientId };
  if (q.scope === 'queue') query.status = 'queued';
  else if (q.scope === 'mine') {
    query.mine = '1';
    query.status = 'active';
  } else if (q.status) query.status = q.status;
  const page = await http.get<Paginated<ChatDto>>('/chat/chats/', query);
  const results = page.results.map(mapChat);
  // A fila anda por ordem de chegada (posição 1 primeiro); o backend lista do mais novo para o mais antigo.
  if (q.scope === 'queue') results.sort((a, b) => (a.queue?.position ?? Number.MAX_SAFE_INTEGER) - (b.queue?.position ?? Number.MAX_SAFE_INTEGER) || a.queuedAt.localeCompare(b.queuedAt));
  return { count: page.count, results };
}

export async function getChatCounts(): Promise<ChatCounts> {
  const count = async (query: Record<string, string>): Promise<number> => (await http.get<Paginated<ChatDto>>('/chat/chats/', { limit: 1, ...query })).count;
  const [queue, mine, all] = await Promise.all([count({ status: 'queued' }), count({ mine: '1', status: 'active' }), count({})]);
  return { queue, mine, all };
}

export async function getChat(id: string): Promise<Chat> {
  return mapChat(await http.get<ChatDto>(`${base(id)}/`));
}

export async function listMessages(chatId: string, query: MessagesQuery = {}): Promise<ChatMessage[]> {
  const list = await http.get<ChatMessageDto[]>(`${base(chatId)}/messages/`, { after: query.after, before: query.before, limit: query.limit });
  return list.map((m) => mapChatMessage(m, chatId));
}

export async function sendFiles(chatId: string, input: SendChatInput): Promise<ChatMessage> {
  const form = new FormData();
  for (const f of input.files ?? []) form.append('files', f, f.name);
  form.append('body', input.body);
  if (input.replyToId) form.append('reply_to', input.replyToId);
  if (input.internalNote) form.append('is_internal_note', 'true');
  return mapChatMessage(await http.post<ChatMessageDto>(`${base(chatId)}/files/`, form), chatId);
}

export async function editMessage(chatId: string, messageId: string, body: string): Promise<ChatMessage> {
  return mapChatMessage(await http.patch<ChatMessageDto>(`${base(chatId)}/messages/${encodeURIComponent(messageId)}/`, { body }), chatId);
}

export async function deleteMessage(chatId: string, messageId: string): Promise<ChatMessage> {
  return mapChatMessage(await http.delete<ChatMessageDto>(`${base(chatId)}/messages/${encodeURIComponent(messageId)}/`), chatId);
}

export async function markRead(chatId: string): Promise<void> {
  await http.post(`${base(chatId)}/read/`);
}

export async function getChatMedia(chatId: string): Promise<ChatMedia> {
  return mapChatMedia(await http.get<ChatMediaDto>(`${base(chatId)}/media/`));
}

const action = async (id: string, name: string, body?: unknown): Promise<Chat> => mapChat(await http.post<ChatDto>(`${base(id)}/${name}/`, body));

export const takeChat = (id: string) => action(id, 'take');
export const joinChat = (id: string) => action(id, 'join');
export const leaveChat = (id: string) => action(id, 'leave');
export const assumeChat = (id: string) => action(id, 'assume');

export function transferChat(id: string, agentId: string, note = ''): Promise<Chat> {
  return action(id, 'transfer', { agent_id: Number(agentId), note });
}

export function closeChat(id: string, input: CloseChatInput = {}): Promise<Chat> {
  const body: Record<string, unknown> = { note: input.note ?? '' };
  if (input.reasonId) body.reason_id = Number(input.reasonId);
  if (input.agentScore !== undefined && input.agentScore !== null) body.agent_score = input.agentScore;
  return action(id, 'close', body);
}

export function reopenChat(id: string, note = ''): Promise<Chat> {
  return action(id, 'reopen', { note });
}

export function convertChat(id: string, teamId: string): Promise<Chat> {
  return action(id, 'convert', { team_id: Number(teamId) });
}

export function applyMacro(id: string, macroId: string): Promise<Chat> {
  return action(id, 'apply-macro', { macro_id: Number(macroId) });
}

export async function updateChat(id: string, patch: { name?: string; priority?: ChatPriority }): Promise<Chat> {
  return mapChat(await http.patch<ChatDto>(`${base(id)}/`, patch));
}

/** PDF da conversa (a exportação fica na trilha de auditoria; `notes=1` leva as notas internas e só vale para interno). */
export async function exportChat(id: string, withNotes: boolean): Promise<{ blob: Blob; fileName: string }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${base(id)}/export/${withNotes ? '?notes=1' : ''}`, { credentials: 'include', headers: { Accept: '*/*' } });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua rede e tente novamente.', { status: 0, code: 'rede' });
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw toApiError(res.status, body, res.headers);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), fileName: match?.[1] ? decodeURIComponent(match[1]) : `chat-${id}.pdf` };
}

/* ------------------------------- cadastros ------------------------------- */

export async function listChatMacros(): Promise<ChatMacro[]> {
  return asArray(await http.get<Paginated<ChatMacroDto> | ChatMacroDto[]>('/chat/macros/', { limit: 500 })).map(mapChatMacro);
}

export async function listCloseReasons(): Promise<ChatCloseReason[]> {
  return asArray(await http.get<Paginated<ChatCloseReasonDto> | ChatCloseReasonDto[]>('/chat/close-reasons/', { limit: 500 })).map(mapCloseReason);
}

export async function saveCloseReason(input: CloseReasonInput): Promise<ChatCloseReason> {
  const body = { name: input.name.trim(), requires_note: input.requiresNote, is_active: input.active, ...(input.order !== undefined ? { order: input.order } : {}) };
  const dto = input.id ? await http.patch<ChatCloseReasonDto>(`/chat/close-reasons/${input.id}/`, body) : await http.post<ChatCloseReasonDto>('/chat/close-reasons/', body);
  return mapCloseReason(dto);
}

export async function deleteCloseReason(id: string): Promise<void> {
  await http.delete(`/chat/close-reasons/${id}/`);
}

export async function listQuickReplies(): Promise<ChatQuickReply[]> {
  return asArray(await http.get<Paginated<ChatQuickReplyDto> | ChatQuickReplyDto[]>('/chat/quick-replies/', { limit: 500 })).map(mapQuickReply);
}

export async function saveQuickReply(input: QuickReplyInput): Promise<ChatQuickReply> {
  const body = { contexto: input.context, rotulo: input.label.trim(), texto: input.text, is_active: input.active, ...(input.order !== undefined ? { order: input.order } : {}) };
  const dto = input.id ? await http.patch<ChatQuickReplyDto>(`/chat/quick-replies/${input.id}/`, body) : await http.post<ChatQuickReplyDto>('/chat/quick-replies/', body);
  return mapQuickReply(dto);
}

export async function deleteQuickReply(id: string): Promise<void> {
  await http.delete(`/chat/quick-replies/${id}/`);
}

export async function listBannedWords(): Promise<ChatBannedWord[]> {
  return asArray(await http.get<Paginated<ChatBannedWordDto> | ChatBannedWordDto[]>('/chat/banned-words/', { limit: 1000 })).map(mapBannedWord);
}

export async function addBannedWord(word: string): Promise<ChatBannedWord> {
  return mapBannedWord(await http.post<ChatBannedWordDto>('/chat/banned-words/', { word }));
}

export async function deleteBannedWord(id: string): Promise<void> {
  await http.delete(`/chat/banned-words/${id}/`);
}

export async function getChatConfig(): Promise<ChatConfig> {
  return mapChatConfig(await http.get<ChatConfigDto>('/chat/config/'));
}

export async function saveChatConfig(input: ChatConfigInput): Promise<ChatConfig> {
  return mapChatConfig(await http.put<ChatConfigDto>('/chat/config/', chatConfigToDto(input)));
}

/* ------------------------------ tempo real ------------------------------- */

export function openRoom(chatId: string, handlers: ChatRoomHandlers): ChatRoom {
  const socket = new ChatSocket(chatId, {
    onMessage: (raw) => {
      const ev = mapRoomEvent(raw, chatId);
      if (ev) handlers.onEvent(ev);
    },
    onOpen: (info) => handlers.onOpen?.(info),
    onClose: () => handlers.onClose?.(),
  });
  socket.start();
  return {
    sendText: (body, opts = {}) =>
      socket.send({
        type: 'message',
        body,
        ...(opts.replyToId ? { reply_to: Number(opts.replyToId) } : {}),
        ...(opts.internalNote ? { is_internal_note: true } : {}),
      }),
    sendTyping: (isTyping) => {
      socket.send({ type: 'typing', is_typing: isTyping });
    },
    sendDelivered: (ids) => {
      const numeric = ids.map(Number).filter((n) => Number.isInteger(n));
      if (numeric.length > 0) socket.send({ type: 'delivered', ids: numeric });
    },
    close: () => socket.stop(),
  };
}

/** Eventos de fila e avisos de mensagem chegam pela conexão pessoal que já existe (`/ws/me/`): uma só por aba. */
export function subscribeInbox(handlers: ChatInboxHandlers): () => void {
  const sock = getMeSocket();
  const offChat = sock.addChatListener((ev) => {
    if (ev.type === 'chat_queued') handlers.onEvent({ type: 'queued', chatId: String(ev.chat_id), clientName: ev.client_name ?? '', company: ev.company ?? '' });
    else if (ev.type === 'chat_taken') handlers.onEvent({ type: 'taken', chatId: String(ev.chat_id) });
    else if (ev.kind === 'chat_message') handlers.onEvent({ type: 'message', chatId: String(ev.chat_id), preview: ev.preview ?? '', authorName: ev.author_name ?? '' });
    else handlers.onEvent({ type: 'taken', chatId: String(ev.chat_id) }); // chat_transferred etc.: a lista revalida
  });
  const offOpen = sock.addOpenListener(() => handlers.onEvent({ type: 'reconnected' }));
  return () => {
    offChat();
    offOpen();
  };
}

