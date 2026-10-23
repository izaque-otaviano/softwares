import { create } from 'zustand';
import * as chatApi from '@/api/chat';
import { markdownToHtml } from '@/api/real/mappers/markdown';
import { toast } from '@/store/useUi';
import { useSession } from '@/store/useSession';
import type { Chat, ChatCounts, ChatListScope, ChatMedia, ChatMessage, ChatRoom, ChatRoomEvent, ChatStatus, CloseChatInput, SendChatInput } from '@/types/chat';

/**
 * Estado do chat de atendimento: listas por aba, a conversa aberta e o tempo real.
 *
 * Regras que importam:
 * - mensagens são identificadas pelo id do servidor: a mesma mensagem chegando por REST e pela sala NUNCA duplica;
 * - o texto sai pela sala (WebSocket); a mensagem enviada aparece como "enviando" até o servidor devolvê-la;
 * - tudo que é timer, sala e assinatura é limpo em `stop()` (a página chama ao desmontar).
 */

export const PAGE_SIZE = 50;
const MESSAGES_PAGE = 60;
const POLL_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 400;
const TYPING_MS = 5_000;
const SEND_TIMEOUT_MS = 12_000;
const READ_DEBOUNCE_MS = 600;

export interface ListState {
  items: Chat[];
  count: number;
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error: string | null;
}

export interface ConversationState {
  chatId: string;
  chat: Chat | null;
  /** Mensagens confirmadas pelo servidor, em ordem de id. */
  messages: ChatMessage[];
  /** Enviadas por aqui e ainda sem confirmação (enviando) ou que falharam. */
  pending: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Quem está digitando agora (o outro lado). */
  typingName: string | null;
  connected: boolean;
  media: ChatMedia | null;
  /** Uma ação do ciclo de vida em andamento (pegar, encerrar...): trava os botões. */
  busy: boolean;
}

const emptyList = (): ListState => ({ items: [], count: 0, loading: false, loadingMore: false, loaded: false, error: null });

export interface ChatStoreState {
  scope: ChatListScope;
  statusFilter: ChatStatus | 'all';
  query: string;
  lists: Record<ChatListScope, ListState>;
  counts: ChatCounts;
  conversation: ConversationState | null;
  drafts: Record<string, string>;

  setScope: (scope: ChatListScope) => void;
  setStatusFilter: (status: ChatStatus | 'all') => void;
  setQuery: (query: string) => void;
  loadList: (scope?: ChatListScope, opts?: { silent?: boolean }) => Promise<void>;
  loadMoreList: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  refreshAll: () => Promise<void>;
  /** Abre (ou fecha, com `null`) a conversa. */
  select: (chatId: string | null) => Promise<void>;
  reloadConversation: () => Promise<void>;
  loadOlder: () => Promise<void>;
  loadMedia: () => Promise<void>;
  setDraft: (chatId: string, text: string) => void;
  /** Envia texto pela sala. Devolve `false` quando não há conexão (nada foi enviado e o rascunho deve ser mantido). */
  sendText: (body: string, opts?: { internalNote?: boolean; replyToId?: string | null }) => boolean;
  retryPending: (tempId: string) => void;
  discardPending: (tempId: string) => void;
  sendFiles: (input: SendChatInput) => Promise<boolean>;
  sendTyping: (isTyping: boolean) => void;
  editMessage: (messageId: string, body: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  take: () => Promise<boolean>;
  join: () => Promise<boolean>;
  leave: () => Promise<boolean>;
  assume: () => Promise<boolean>;
  transfer: (agentId: string, note?: string) => Promise<boolean>;
  close: (input: CloseChatInput) => Promise<boolean>;
  reopen: (note?: string) => Promise<boolean>;
  convert: (teamId: string) => Promise<boolean>;
  applyMacro: (macroId: string) => Promise<boolean>;
  updateChat: (patch: { name?: string }) => Promise<boolean>;
  /** Liga a caixa de entrada em tempo real e a revalidação periódica. Chame `stop` ao sair da tela. */
  start: () => void;
  stop: () => void;
}

/* ------------------------------ utilitários ------------------------------- */

const num = (id: string): number => Number(id);

/** Junta mensagens por id (a última versão vence) mantendo a ordem do servidor. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => num(a.id) - num(b.id));
}

const me = (): { id: string; name: string } | null => {
  const u = useSession.getState().user;
  return u ? { id: u.id, name: u.name } : null;
};

/** Mensagem escrita por quem está logado (o backend só informa o NOME do autor). */
export const isMineMessage = (m: Pick<ChatMessage, 'authorIsInternal' | 'authorName'>): boolean => {
  const user = me();
  return Boolean(user && m.authorIsInternal && m.authorName === user.name);
};

/** Quem atende (dono ou participante) pode escrever; só ele marca como lido. */
export function isParticipating(chat: Chat | null): boolean {
  const user = me();
  if (!chat || !user) return false;
  return chat.agentId === user.id || chat.participants.some((p) => p.id === user.id);
}

const messageOf = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/* ------------------------- recursos fora do estado ------------------------ */

let room: ChatRoom | null = null;
let roomChatId: string | null = null;
let inboxOff: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let readTimer: ReturnType<typeof setTimeout> | undefined;
const sendTimers = new Map<string, ReturnType<typeof setTimeout>>();
let startCount = 0;
let startedAt = 0;
/** O canal pessoal reenvia a fila atual ao conectar: avisos nesse intervalo não são novidade. */
const QUIET_AFTER_START_MS = 4_000;
let tempSeq = 0;
const listTokens: Record<ChatListScope, number> = { queue: 0, mine: 0, all: 0 };
let selectToken = 0;

function closeRoom(): void {
  room?.close();
  room = null;
  roomChatId = null;
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = undefined;
  if (readTimer) clearTimeout(readTimer);
  readTimer = undefined;
  sendTimers.forEach(clearTimeout);
  sendTimers.clear();
}

export const useChatStore = create<ChatStoreState>()((set, get) => {
  const patchConv = (chatId: string, fn: (c: ConversationState) => Partial<ConversationState>): void =>
    set((s) => (s.conversation && s.conversation.chatId === chatId ? { conversation: { ...s.conversation, ...fn(s.conversation) } } : s));

  /** Atualiza o chat nas listas e na conversa aberta com a versão mais nova do servidor. */
  const applyChat = (chat: Chat): void =>
    set((s) => ({
      lists: Object.fromEntries(
        (Object.keys(s.lists) as ChatListScope[]).map((k) => [k, { ...s.lists[k], items: s.lists[k].items.map((c) => (c.id === chat.id ? { ...chat, queue: chat.queue ?? c.queue } : c)) }]),
      ) as Record<ChatListScope, ListState>,
      conversation: s.conversation && s.conversation.chatId === chat.id ? { ...s.conversation, chat } : s.conversation,
    }));

  const scheduleRefresh = (): void => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void get().refreshAll();
    }, REFRESH_DEBOUNCE_MS);
  };

  const markReadSoon = (chatId: string): void => {
    if (readTimer) clearTimeout(readTimer);
    readTimer = setTimeout(() => {
      readTimer = undefined;
      const conv = get().conversation;
      if (!conv || conv.chatId !== chatId || !isParticipating(conv.chat)) return;
      void chatApi
        .markRead(chatId)
        .then(() => {
          patchConv(chatId, (c) => ({ chat: c.chat ? { ...c.chat, unreadCount: 0 } : c.chat }));
          set((s) => ({ lists: Object.fromEntries((Object.keys(s.lists) as ChatListScope[]).map((k) => [k, { ...s.lists[k], items: s.lists[k].items.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)) }])) as Record<ChatListScope, ListState> }));
        })
        .catch(() => undefined);
    }, READ_DEBOUNCE_MS);
  };

  const onRoomEvent = (chatId: string, ev: ChatRoomEvent): void => {
    const conv = get().conversation;
    if (!conv || conv.chatId !== chatId) return;
    switch (ev.type) {
      case 'message':
      case 'message_edited':
      case 'message_deleted': {
        const incoming = ev.message;
        // Confirma a mensagem "enviando" equivalente (o servidor devolve o texto sem identificador do envio).
        let pending = conv.pending;
        if (ev.type === 'message' && isMineMessage(incoming)) {
          const i = pending.findIndex((p) => p.state === 'sending' && p.body === incoming.body && p.isInternalNote === incoming.isInternalNote);
          if (i >= 0) {
            const tid = pending[i]!.id;
            const timer = sendTimers.get(tid);
            if (timer) clearTimeout(timer);
            sendTimers.delete(tid);
            pending = pending.filter((_, k) => k !== i);
          }
        }
        patchConv(chatId, (c) => ({ messages: mergeMessages(c.messages, [{ ...incoming, canEdit: false }]), pending }));
        if (ev.type === 'message' && !incoming.authorIsInternal && !incoming.isSystem) {
          if (isParticipating(conv.chat)) {
            room?.sendDelivered([incoming.id]);
            markReadSoon(chatId);
          }
          patchConv(chatId, () => ({ typingName: null }));
        }
        if (ev.type === 'message') scheduleRefresh();
        break;
      }
      case 'delivered': {
        const at = new Date().toISOString();
        patchConv(chatId, (c) => ({ messages: c.messages.map((m) => (ev.ids.includes(m.id) && !m.deliveredAt ? { ...m, deliveredAt: at } : m)) }));
        break;
      }
      case 'read': {
        const at = new Date().toISOString();
        patchConv(chatId, (c) => ({ messages: c.messages.map((m) => (ev.ids.includes(m.id) ? { ...m, readAt: m.readAt ?? at, deliveredAt: m.deliveredAt ?? at } : m)) }));
        break;
      }
      case 'typing': {
        const user = me();
        if (user && ev.userId === user.id) return;
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = undefined;
        if (!ev.isTyping) {
          patchConv(chatId, () => ({ typingName: null }));
          return;
        }
        patchConv(chatId, () => ({ typingName: ev.userName || 'Cliente' }));
        typingTimer = setTimeout(() => {
          typingTimer = undefined;
          patchConv(chatId, () => ({ typingName: null }));
        }, TYPING_MS);
        break;
      }
      case 'queue_position':
        patchConv(chatId, (c) => ({ chat: c.chat ? { ...c.chat, queue: ev.queue } : c.chat }));
        break;
      case 'accepted':
      case 'transferred':
      case 'closed':
      case 'converted': {
        // O estado do chat (quem atende, status, ticket) é do servidor: busca de novo e atualiza as listas.
        void chatApi
          .getChat(chatId)
          .then((chat) => applyChat(chat))
          .catch(() => undefined);
        scheduleRefresh();
        break;
      }
      case 'error':
        toast.error(ev.detail);
        patchConv(chatId, (c) => ({ pending: c.pending.map((p) => (p.state === 'sending' ? { ...p, state: 'failed' as const } : p)) }));
        break;
    }
  };

  const fillGap = async (chatId: string): Promise<void> => {
    const conv = get().conversation;
    if (!conv || conv.chatId !== chatId) return;
    const lastId = conv.messages.at(-1)?.id;
    try {
      const [chat, fresh] = await Promise.all([chatApi.getChat(chatId), chatApi.listMessages(chatId, lastId ? { after: lastId } : { limit: MESSAGES_PAGE })]);
      patchConv(chatId, (c) => ({ chat, messages: mergeMessages(c.messages, fresh) }));
      applyChat(chat);
    } catch {
      /* a próxima reconexão ou o recarregar manual cobre */
    }
  };

  const lifecycle = async (fn: (chatId: string) => Promise<Chat>, done?: string): Promise<boolean> => {
    const conv = get().conversation;
    if (!conv) return false;
    const chatId = conv.chatId;
    patchConv(chatId, () => ({ busy: true }));
    try {
      const chat = await fn(chatId);
      applyChat(chat);
      if (done) toast.success(done);
      // O servidor grava a mensagem de sistema ("entrou na conversa"...); a sala a entrega, e o REST cobre quem não recebeu.
      void fillGap(chatId);
      void get().refreshAll();
      return true;
    } catch (e) {
      toast.error(messageOf(e, 'Não foi possível concluir a ação.'));
      return false;
    } finally {
      patchConv(chatId, () => ({ busy: false }));
    }
  };

  return {
    scope: 'queue',
    statusFilter: 'all',
    query: '',
    lists: { queue: emptyList(), mine: emptyList(), all: emptyList() },
    counts: { queue: 0, mine: 0, all: 0 },
    conversation: null,
    drafts: {},

    setScope: (scope) => {
      set({ scope });
      void get().loadList(scope);
    },
    setStatusFilter: (statusFilter) => {
      set({ statusFilter });
      void get().loadList('all');
    },
    setQuery: (query) => {
      set({ query });
      void get().loadList();
    },

    loadList: async (scopeArg, opts = {}) => {
      const s = get();
      const scope = scopeArg ?? s.scope;
      const token = ++listTokens[scope];
      set((st) => ({ lists: { ...st.lists, [scope]: { ...st.lists[scope], loading: !opts.silent, error: opts.silent ? st.lists[scope].error : null } } }));
      try {
        const page = await chatApi.listChats({ scope, q: s.query, status: scope === 'all' && s.statusFilter !== 'all' ? s.statusFilter : undefined, limit: PAGE_SIZE });
        if (token !== listTokens[scope]) return; // uma busca mais nova desta aba já está a caminho
        set((st) => ({ lists: { ...st.lists, [scope]: { items: page.results, count: page.count, loading: false, loadingMore: false, loaded: true, error: null } } }));
      } catch (e) {
        if (opts.silent) {
          set((st) => ({ lists: { ...st.lists, [scope]: { ...st.lists[scope], loading: false } } }));
          return;
        }
        set((st) => ({ lists: { ...st.lists, [scope]: { ...st.lists[scope], loading: false, error: messageOf(e, 'Não foi possível carregar as conversas.') } } }));
      }
    },

    loadMoreList: async () => {
      const s = get();
      const scope = s.scope;
      const list = s.lists[scope];
      if (list.loadingMore || list.items.length >= list.count) return;
      set((st) => ({ lists: { ...st.lists, [scope]: { ...st.lists[scope], loadingMore: true } } }));
      try {
        const page = await chatApi.listChats({ scope, q: s.query, status: scope === 'all' && s.statusFilter !== 'all' ? s.statusFilter : undefined, limit: PAGE_SIZE, offset: list.items.length });
        set((st) => {
          const seen = new Set(st.lists[scope].items.map((c) => c.id));
          return { lists: { ...st.lists, [scope]: { ...st.lists[scope], items: [...st.lists[scope].items, ...page.results.filter((c) => !seen.has(c.id))], count: page.count, loadingMore: false } } };
        });
      } catch (e) {
        set((st) => ({ lists: { ...st.lists, [scope]: { ...st.lists[scope], loadingMore: false } } }));
        toast.error(messageOf(e, 'Não foi possível carregar mais conversas.'));
      }
    },

    refreshCounts: async () => {
      try {
        set({ counts: await chatApi.getChatCounts() });
      } catch {
        /* contadores são cortesia; a lista mostra o erro */
      }
    },

    refreshAll: async () => {
      await Promise.all([get().loadList(undefined, { silent: true }), get().refreshCounts()]);
    },

    select: async (chatId) => {
      const token = ++selectToken;
      if (chatId === roomChatId && get().conversation?.chatId === chatId) return;
      closeRoom();
      if (!chatId) {
        set({ conversation: null });
        return;
      }
      set({
        conversation: { chatId, chat: null, messages: [], pending: [], loading: true, error: null, hasMore: false, loadingMore: false, typingName: null, connected: false, media: null, busy: false },
      });
      try {
        const [chat, messages] = await Promise.all([chatApi.getChat(chatId), chatApi.listMessages(chatId, { limit: MESSAGES_PAGE })]);
        if (token !== selectToken) return;
        patchConv(chatId, () => ({ chat, messages: mergeMessages([], messages), loading: false, hasMore: messages.length >= MESSAGES_PAGE }));
        roomChatId = chatId;
        room = chatApi.openRoom(chatId, {
          onEvent: (ev) => onRoomEvent(chatId, ev),
          onOpen: ({ reconnected }) => {
            patchConv(chatId, () => ({ connected: true }));
            if (reconnected) void fillGap(chatId);
          },
          onClose: () => patchConv(chatId, () => ({ connected: false, typingName: null })),
        });
        if (isParticipating(chat)) {
          const undelivered = messages.filter((m) => !m.authorIsInternal && !m.isSystem && !m.deliveredAt).map((m) => m.id);
          if (undelivered.length) room.sendDelivered(undelivered);
          if (chat.unreadCount > 0) markReadSoon(chatId);
        }
      } catch (e) {
        if (token !== selectToken) return;
        patchConv(chatId, () => ({ loading: false, error: messageOf(e, 'Não foi possível abrir a conversa.') }));
      }
    },

    reloadConversation: async () => {
      const conv = get().conversation;
      if (!conv) return;
      roomChatId = null;
      await get().select(conv.chatId);
    },

    loadOlder: async () => {
      const conv = get().conversation;
      const first = conv?.messages[0];
      if (!conv || !first || conv.loadingMore || !conv.hasMore) return;
      const chatId = conv.chatId;
      patchConv(chatId, () => ({ loadingMore: true }));
      try {
        const older = await chatApi.listMessages(chatId, { before: first.id, limit: MESSAGES_PAGE });
        patchConv(chatId, (c) => ({ messages: mergeMessages(c.messages, older), hasMore: older.length >= MESSAGES_PAGE, loadingMore: false }));
      } catch (e) {
        patchConv(chatId, () => ({ loadingMore: false }));
        toast.error(messageOf(e, 'Não foi possível carregar as mensagens anteriores.'));
      }
    },

    loadMedia: async () => {
      const conv = get().conversation;
      if (!conv) return;
      try {
        const media = await chatApi.getChatMedia(conv.chatId);
        patchConv(conv.chatId, () => ({ media }));
      } catch {
        patchConv(conv.chatId, () => ({ media: { files: [], links: [] } }));
      }
    },

    setDraft: (chatId, text) => set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),

    sendText: (body, opts = {}) => {
      const conv = get().conversation;
      const text = body.trim();
      if (!conv || !text || !room) return false;
      const user = me();
      const tempId = `tmp-${++tempSeq}`;
      const sent = room.sendText(text, opts);
      if (!sent) return false;
      const pendingMsg: ChatMessage = {
        id: tempId,
        chatId: conv.chatId,
        authorName: user?.name ?? 'Você',
        authorIsInternal: true,
        body: text,
        bodyHtml: markdownToHtml(text),
        isSystem: false,
        isInternalNote: Boolean(opts.internalNote),
        sentAt: new Date().toISOString(),
        readAt: null,
        deliveredAt: null,
        files: [],
        editedAt: null,
        deleted: false,
        canEdit: false,
        replyTo: null,
        state: 'sending',
      };
      patchConv(conv.chatId, (c) => ({ pending: [...c.pending, pendingMsg] }));
      sendTimers.set(
        tempId,
        setTimeout(() => {
          sendTimers.delete(tempId);
          patchConv(conv.chatId, (c) => ({ pending: c.pending.map((p) => (p.id === tempId && p.state === 'sending' ? { ...p, state: 'failed' as const } : p)) }));
        }, SEND_TIMEOUT_MS),
      );
      return true;
    },

    retryPending: (tempId) => {
      const conv = get().conversation;
      const item = conv?.pending.find((p) => p.id === tempId);
      if (!conv || !item) return;
      if (!room) {
        toast.error('Sem conexão com a conversa. Aguarde a reconexão e tente de novo.');
        return;
      }
      patchConv(conv.chatId, (c) => ({ pending: c.pending.filter((p) => p.id !== tempId) }));
      if (!get().sendText(item.body, { internalNote: item.isInternalNote })) {
        patchConv(conv.chatId, (c) => ({ pending: [...c.pending, item] }));
        toast.error('Sem conexão com a conversa. Aguarde a reconexão e tente de novo.');
      }
    },

    discardPending: (tempId) => {
      const conv = get().conversation;
      if (!conv) return;
      const timer = sendTimers.get(tempId);
      if (timer) clearTimeout(timer);
      sendTimers.delete(tempId);
      patchConv(conv.chatId, (c) => ({ pending: c.pending.filter((p) => p.id !== tempId) }));
    },

    sendFiles: async (input) => {
      const conv = get().conversation;
      if (!conv) return false;
      const chatId = conv.chatId;
      try {
        const message = await chatApi.sendFiles(chatId, input);
        patchConv(chatId, (c) => ({ messages: mergeMessages(c.messages, [{ ...message, canEdit: false }]) }));
        scheduleRefresh();
        return true;
      } catch (e) {
        toast.error(messageOf(e, 'Não foi possível enviar o anexo.'));
        return false;
      }
    },

    sendTyping: (isTyping) => {
      room?.sendTyping(isTyping);
    },

    editMessage: async (messageId, body) => {
      const conv = get().conversation;
      if (!conv) return false;
      try {
        const message = await chatApi.editMessage(conv.chatId, messageId, body);
        patchConv(conv.chatId, (c) => ({ messages: mergeMessages(c.messages, [{ ...message, canEdit: false }]) }));
        return true;
      } catch (e) {
        toast.error(messageOf(e, 'Não foi possível editar a mensagem.'));
        return false;
      }
    },

    deleteMessage: async (messageId) => {
      const conv = get().conversation;
      if (!conv) return false;
      try {
        const message = await chatApi.deleteMessage(conv.chatId, messageId);
        patchConv(conv.chatId, (c) => ({ messages: mergeMessages(c.messages, [{ ...message, canEdit: false }]) }));
        return true;
      } catch (e) {
        toast.error(messageOf(e, 'Não foi possível apagar a mensagem.'));
        return false;
      }
    },

    take: () => lifecycle((id) => chatApi.takeChat(id), 'Você assumiu a conversa.'),
    join: () => lifecycle((id) => chatApi.joinChat(id), 'Você entrou na conversa.'),
    leave: () => lifecycle((id) => chatApi.leaveChat(id), 'Você saiu da conversa.'),
    assume: () => lifecycle((id) => chatApi.assumeChat(id), 'Você assumiu o atendimento.'),
    transfer: (agentId, note) => lifecycle((id) => chatApi.transferChat(id, agentId, note), 'Conversa transferida.'),
    close: (input) => lifecycle((id) => chatApi.closeChat(id, input), 'Conversa encerrada.'),
    reopen: (note) => lifecycle((id) => chatApi.reopenChat(id, note), 'Conversa reaberta. Ela voltou para a fila.'),
    convert: (teamId) => lifecycle((id) => chatApi.convertChat(id, teamId), 'Conversa convertida em ticket.'),
    applyMacro: async (macroId) => {
      const conv = get().conversation;
      if (!conv) return false;
      try {
        applyChat(await chatApi.applyMacro(conv.chatId, macroId));
        return true;
      } catch (e) {
        toast.error(messageOf(e, 'Não foi possível aplicar a macro.'));
        return false;
      }
    },
    updateChat: async (patch) => {
      const conv = get().conversation;
      if (!conv) return false;
      try {
        applyChat(await chatApi.updateChat(conv.chatId, patch));
        return true;
      } catch (e) {
        toast.error(messageOf(e, 'Não foi possível salvar.'));
        return false;
      }
    },

    start: () => {
      startCount += 1;
      if (startCount > 1) return;
      startedAt = Date.now();
      inboxOff = chatApi.subscribeInbox({
        onEvent: (ev) => {
          if (ev.type === 'queued' && ev.clientName && Date.now() - startedAt > QUIET_AFTER_START_MS) toast.info(`Novo chat na fila: ${ev.clientName}`, ev.company ? { description: ev.company } : undefined);
          scheduleRefresh();
          if (ev.type === 'reconnected') {
            const conv = get().conversation;
            if (conv) void fillGap(conv.chatId);
          }
        },
      });
      pollTimer = setInterval(() => void get().refreshAll(), POLL_MS);
    },

    stop: () => {
      startCount = Math.max(0, startCount - 1);
      if (startCount > 0) return;
      inboxOff?.();
      inboxOff = null;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = undefined;
      selectToken += 1;
      closeRoom();
      set({ conversation: null });
    },
  };
});

/** Volta o store ao zero (testes e troca de usuário). */
export function resetChatStore(): void {
  startCount = 0;
  inboxOff?.();
  inboxOff = null;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  selectToken += 1;
  listTokens.queue += 1;
  listTokens.mine += 1;
  listTokens.all += 1;
  closeRoom();
  useChatStore.setState({
    scope: 'queue',
    statusFilter: 'all',
    query: '',
    lists: { queue: emptyList(), mine: emptyList(), all: emptyList() },
    counts: { queue: 0, mine: 0, all: 0 },
    conversation: null,
    drafts: {},
  });
}
