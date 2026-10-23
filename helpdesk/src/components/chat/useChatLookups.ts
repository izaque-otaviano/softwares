import { create } from 'zustand';
import * as chatApi from '@/api/chat';
import { metaApi, usersApi } from '@/api';
import type { Group, User } from '@/types/domain';
import type { ChatCloseReason, ChatConfig, ChatMacro, ChatQuickReply } from '@/types/chat';

/** Cadastros que a conversa usa (motivos, macros, respostas rápidas, agentes, equipes, escala de nota). */
interface LookupsState {
  reasons: ChatCloseReason[];
  macros: ChatMacro[];
  quickReplies: ChatQuickReply[];
  agents: User[];
  teams: Group[];
  config: ChatConfig | null;
  loaded: boolean;
  loading: boolean;
  /** Falhas de carga por recurso (uma lista que falha não derruba as outras). */
  failed: string[];
  load: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export const useChatLookups = create<LookupsState>()((set, get) => ({
  reasons: [],
  macros: [],
  quickReplies: [],
  agents: [],
  teams: [],
  config: null,
  loaded: false,
  loading: false,
  failed: [],

  load: async (force = false) => {
    const s = get();
    if (s.loading || (s.loaded && !force)) return;
    set({ loading: true });
    const failed: string[] = [];
    const safe = async <T,>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        failed.push(name);
        return fallback;
      }
    };
    const [reasons, macros, quickReplies, users, teams, config] = await Promise.all([
      safe('motivos de encerramento', () => chatApi.listCloseReasons(), [] as ChatCloseReason[]),
      safe('macros', () => chatApi.listChatMacros(), [] as ChatMacro[]),
      safe('respostas rápidas', () => chatApi.listQuickReplies(), [] as ChatQuickReply[]),
      safe('agentes', () => usersApi.listUsers(), [] as User[]),
      safe('equipes', () => metaApi.listGroups(), [] as Group[]),
      safe('configuração do chat', () => chatApi.getChatConfig(), null as ChatConfig | null),
    ]);
    set({
      reasons,
      macros,
      quickReplies,
      agents: users.filter((u) => u.role !== 'end_user' && !u.suspended),
      teams,
      config,
      failed,
      loaded: true,
      loading: false,
    });
  },

  reset: () => set({ reasons: [], macros: [], quickReplies: [], agents: [], teams: [], config: null, loaded: false, loading: false, failed: [] }),
}));
