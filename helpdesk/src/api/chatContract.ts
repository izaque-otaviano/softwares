import type {
  Chat,
  ChatBannedWord,
  ChatCloseReason,
  ChatConfig,
  ChatConfigInput,
  ChatCounts,
  ChatInboxHandlers,
  ChatListQuery,
  ChatMacro,
  ChatMedia,
  ChatMessage,
  ChatPage,
  ChatPriority,
  ChatQuickReply,
  ChatRoom,
  ChatRoomHandlers,
  CloseChatInput,
  SendChatInput,
} from '@/types/chat';

export interface MessagesQuery {
  /** Só o que chegou depois deste id (reconexão sem perda). */
  after?: string;
  /** Só o que veio antes deste id ("carregar anteriores"). */
  before?: string;
  /** As N mais recentes do recorte. */
  limit?: number;
}

export interface QuickReplyInput {
  id?: string;
  context: 'chat' | 'ticket';
  label: string;
  text: string;
  active: boolean;
  order?: number;
}

export interface CloseReasonInput {
  id?: string;
  name: string;
  requiresNote: boolean;
  active: boolean;
  order?: number;
}

/** Contrato do módulo de chat. Mock (`mock/chat.ts`) e real (`real/chat.ts`) implementam o mesmo. */
export interface ChatApi {
  listChats(query: ChatListQuery): Promise<ChatPage>;
  getChatCounts(): Promise<ChatCounts>;
  getChat(id: string): Promise<Chat>;
  listMessages(chatId: string, query?: MessagesQuery): Promise<ChatMessage[]>;
  /** Mensagem com anexos (o texto sozinho vai pela sala em tempo real). */
  sendFiles(chatId: string, input: SendChatInput): Promise<ChatMessage>;
  editMessage(chatId: string, messageId: string, body: string): Promise<ChatMessage>;
  deleteMessage(chatId: string, messageId: string): Promise<ChatMessage>;
  markRead(chatId: string): Promise<void>;
  getChatMedia(chatId: string): Promise<ChatMedia>;
  takeChat(id: string): Promise<Chat>;
  joinChat(id: string): Promise<Chat>;
  leaveChat(id: string): Promise<Chat>;
  assumeChat(id: string): Promise<Chat>;
  transferChat(id: string, agentId: string, note?: string): Promise<Chat>;
  closeChat(id: string, input?: CloseChatInput): Promise<Chat>;
  reopenChat(id: string, note?: string): Promise<Chat>;
  convertChat(id: string, teamId: string): Promise<Chat>;
  applyMacro(id: string, macroId: string): Promise<Chat>;
  updateChat(id: string, patch: { name?: string; priority?: ChatPriority }): Promise<Chat>;
  exportChat(id: string, withNotes: boolean): Promise<{ blob: Blob; fileName: string }>;

  listChatMacros(): Promise<ChatMacro[]>;
  listCloseReasons(): Promise<ChatCloseReason[]>;
  saveCloseReason(input: CloseReasonInput): Promise<ChatCloseReason>;
  deleteCloseReason(id: string): Promise<void>;
  listQuickReplies(): Promise<ChatQuickReply[]>;
  saveQuickReply(input: QuickReplyInput): Promise<ChatQuickReply>;
  deleteQuickReply(id: string): Promise<void>;
  listBannedWords(): Promise<ChatBannedWord[]>;
  addBannedWord(word: string): Promise<ChatBannedWord>;
  deleteBannedWord(id: string): Promise<void>;
  getChatConfig(): Promise<ChatConfig>;
  saveChatConfig(input: ChatConfigInput): Promise<ChatConfig>;

  /** Sala em tempo real de um chat (mensagens, digitação, leitura, atribuição). Fechar libera a conexão e os timers. */
  openRoom(chatId: string, handlers: ChatRoomHandlers): ChatRoom;
  /** Mudanças na fila e avisos de mensagem (canal pessoal). Devolve a função que cancela a assinatura. */
  subscribeInbox(handlers: ChatInboxHandlers): () => void;
}
