import { create } from 'zustand';
import { authApi, type SessionUser, type TwoFactorMethod } from '@/api/auth';
import { IS_REAL } from '@/api/mode';
import { onUnauthorized } from '@/api/real/http';

export type SessionStatus = 'loading' | 'anonymous' | 'two_factor' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Método do segundo fator quando `status === 'two_factor'`. */
  twoFactor: TwoFactorMethod | null;
  /** Mensagem de erro da última tentativa (login/2FA/restauração). */
  error: string | null;
  /** Sessão expirou (401) durante o uso: a tela de login explica. */
  expired: boolean;

  /** Consulta /auth/me/ (mock: já autenticado). Chamada pelo guard ao montar. */
  restore: () => Promise<void>;
  /** Devolve 'ok' | 'two_factor' | 'error' (mensagem em `error`). */
  login: (email: string, password: string) => Promise<'ok' | 'two_factor' | 'error'>;
  verifyTwoFactor: (code: string) => Promise<boolean>;
  resendTwoFactor: () => Promise<boolean>;
  logout: () => Promise<void>;
  /** 401 global: derruba a sessão local sem chamar o backend. */
  expire: () => void;
  clearError: () => void;
}

const messageOf = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

const initial = (): Pick<SessionState, 'status' | 'user' | 'twoFactor' | 'error' | 'expired'> =>
  authApi.initialUser
    ? { status: 'authenticated', user: authApi.initialUser, twoFactor: null, error: null, expired: false }
    : { status: 'loading', user: null, twoFactor: null, error: null, expired: false };

export const useSession = create<SessionState>()((set, get) => ({
  ...initial(),

  restore: async () => {
    if (authApi.initialUser && get().status === 'authenticated') return; // mock: sessão fixa
    try {
      const user = await authApi.fetchMe();
      set(user ? { status: 'authenticated', user, error: null, expired: false } : { status: 'anonymous', user: null });
    } catch (e) {
      set({ status: 'anonymous', user: null, error: messageOf(e, 'Não foi possível verificar a sessão.') });
    }
  },

  login: async (email, password) => {
    set({ error: null, expired: false });
    try {
      const res = await authApi.login(email.trim(), password);
      if (res.status === 'two_factor') {
        set({ status: 'two_factor', twoFactor: res.method, user: null });
        return 'two_factor';
      }
      set({ status: 'authenticated', user: res.user, twoFactor: null });
      return 'ok';
    } catch (e) {
      set({ status: 'anonymous', user: null, error: messageOf(e, 'Não foi possível entrar.') });
      return 'error';
    }
  },

  verifyTwoFactor: async (code) => {
    set({ error: null });
    try {
      const user = await authApi.verifyTwoFactor(code.trim());
      set({ status: 'authenticated', user, twoFactor: null });
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Código esgotado/sessão pendente expirada: volta ao início; erro de digitação mantém a etapa.
      set(status === 401 || status === 403 ? { status: 'anonymous', twoFactor: null, user: null, error: messageOf(e, 'Código inválido.') } : { error: messageOf(e, 'Código inválido.') });
      return false;
    }
  },

  resendTwoFactor: async () => {
    set({ error: null });
    try {
      await authApi.resendTwoFactor();
      return true;
    } catch (e) {
      set({ error: messageOf(e, 'Não foi possível reenviar o código.') });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* encerra localmente mesmo se o backend não responder */
    }
    set({ status: 'anonymous', user: null, twoFactor: null, error: null, expired: false });
  },

  expire: () => {
    if (get().status === 'anonymous') return;
    set({ status: 'anonymous', user: null, twoFactor: null, expired: true, error: null });
  },

  clearError: () => set({ error: null }),
}));

// 401 global (só no modo real há chamadas HTTP): sessão expirada leva ao /login.
if (IS_REAL) onUnauthorized(() => useSession.getState().expire());

/** Usuário logado (dentro das rotas protegidas sempre existe). */
export function useMe(): SessionUser {
  const user = useSession((s) => s.user);
  if (!user) throw new Error('useMe fora de uma sessão autenticada.');
  return user;
}

/** Id do usuário logado ('' sem sessão). Substitui a antiga constante de usuário fixo. */
export const useMeId = (): string => useSession((s) => s.user?.id ?? '');

/** Versão não reativa, para stores e funções puras. */
export const getMeId = (): string => useSession.getState().user?.id ?? '';
export const getMe = (): SessionUser | null => useSession.getState().user;
