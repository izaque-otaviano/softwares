import type { ChatApi } from './chatContract';
import { IS_REAL } from './mode';
import * as mock from './mock/chat';
import * as real from './real/chat';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: ChatApi = IS_REAL ? real : mock;

export const {
  listChats,
  getChatCounts,
  getChat,
  listMessages,
  sendFiles,
  editMessage,
  deleteMessage,
  markRead,
  getChatMedia,
  takeChat,
  joinChat,
  leaveChat,
  assumeChat,
  transferChat,
  closeChat,
  reopenChat,
  convertChat,
  applyMacro,
  updateChat,
  exportChat,
  listChatMacros,
  listCloseReasons,
  saveCloseReason,
  deleteCloseReason,
  listQuickReplies,
  saveQuickReply,
  deleteQuickReply,
  listBannedWords,
  addBannedWord,
  deleteBannedWord,
  getChatConfig,
  saveChatConfig,
  openRoom,
  subscribeInbox,
} = impl;
export type { ChatApi, CloseReasonInput, MessagesQuery, QuickReplyInput } from './chatContract';
