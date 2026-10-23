import { create } from 'zustand';
import { ApiError } from '@/api/errors';
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
  /** Limite de tentativas (429): instante (ms) em que o login volta a ser aceito; `null` = sem espera. */
  retryUntil: number | null;

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
  /** Fim da espera do limite de tentativas: libera o botão e limpa o aviso. */
  clearWait: () => void;
}

const messageOf = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

/** `retryUntil` de um erro com espera (429 `Retry-After`); `null` se o erro não pediu espera. */
const waitOf = (e: unknown): number | null => (e instanceof ApiError && e.retryAfter && e.retryAfter > 0 ? Date.now() + e.retryAfter * 1000 : null);

const initial = (): Pick<SessionState, 'status' | 'user' | 'twoFactor' | 'error' | 'expired' | 'retryUntil'> =>
  authApi.initialUser
    ? { status: 'authenticated', user: authApi.initialUser, twoFactor: null, error: null, expired: false, retryUntil: null }
    : { status: 'loading', user: null, twoFactor: null, error: null, expired: false, retryUntil: null };

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
    set({ error: null, expired: false, retryUntil: null });
    try {
      const res = await authApi.login(email.trim(), password);
      if (res.status === 'two_factor') {
        set({ status: 'two_factor', twoFactor: res.method, user: null });
        return 'two_factor';
      }
      set({ status: 'authenticated', user: res.user, twoFactor: null });
      return 'ok';
    } catch (e) {
      set({ status: 'anonymous', user: null, error: messageOf(e, 'Não foi possível entrar.'), retryUntil: waitOf(e) });
      return 'error';
    }
  },

  verifyTwoFactor: async (code) => {
    set({ error: null, retryUntil: null });
    try {
      const user = await authApi.verifyTwoFactor(code.trim());
      set({ status: 'authenticated', user, twoFactor: null });
      return true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Código esgotado/sessão pendente expirada: volta ao início; erro de digitação mantém a etapa.
      const retryUntil = waitOf(e);
      set(status === 401 || status === 403 ? { status: 'anonymous', twoFactor: null, user: null, error: messageOf(e, 'Código inválido.'), retryUntil } : { error: messageOf(e, 'Código inválido.'), retryUntil });
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
    set({ status: 'anonymous', user: null, twoFactor: null, error: null, expired: false, retryUntil: null });
  },

  expire: () => {
    if (get().status === 'anonymous') return;
    set({ status: 'anonymous', user: null, twoFactor: null, expired: true, error: null });
  },

  clearError: () => set({ error: null }),

  clearWait: () => set({ retryUntil: null, error: null }),
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
