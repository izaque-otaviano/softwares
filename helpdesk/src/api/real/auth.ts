import { ApiError } from '../errors';
import type { AuthApi, LoginOutcome, SessionUser, TwoFactorMethod } from '../session';
import { http } from './http';

/** `Me` do backend (`MeSerializer`), só os campos usados aqui. */
export interface MeDto {
  id: number | string;
  email: string;
  full_name?: string;
  kind?: 'internal' | 'client' | string;
  internal_role?: string | null;
  is_internal?: boolean;
  is_admin?: boolean;
  teams?: string[];
  permissions?: string[];
  avatar_url?: string | null;
}

export const NOT_AGENT_MESSAGE = 'Esta conta é de cliente. O Helpdesk é exclusivo para agentes e administradores.';

/** Conta que não é de agente/administrador (kind client ou não interna). */
export function isNotAgent(me: MeDto): boolean {
  return me.kind === 'client' || me.is_internal === false;
}

let currentMeId = '';
let currentPermissions: string[] | null = null;
/** Permissões do usuário logado (`null` = ainda desconhecidas): evita chamadas que o backend já recusaria (403). */
export const hasRealPermission = (perm: string): boolean => currentPermissions === null || currentPermissions.includes(perm);
/** Id do agente logado, para o que roda fora de componente (visões "meus tickets", busca `assignee:me`). */
export const getRealMeId = (): string => currentMeId;

export function mapMe(me: MeDto): SessionUser {
  const admin = me.is_admin === true || me.internal_role === 'admin';
  return {
    id: String(me.id),
    name: me.full_name?.trim() || me.email,
    email: me.email,
    role: admin ? 'admin' : 'agent',
    internalRole: me.internal_role ?? undefined,
    teams: me.teams ?? [],
    permissions: me.permissions ?? [],
    avatarUrl: me.avatar_url ?? null,
  };
}

/** Aceita o `Me` ou derruba a sessão recém-criada e rejeita (kind client). */
async function acceptAgent(me: MeDto): Promise<SessionUser> {
  if (isNotAgent(me)) {
    await http.post('/auth/logout/', undefined, { skipUnauthorized: true }).catch(() => {});
    throw new ApiError(NOT_AGENT_MESSAGE, { status: 403, code: 'not_agent' });
  }
  const user = mapMe(me);
  currentMeId = user.id;
  currentPermissions = user.permissions;
  return user;
}

export const realAuth: AuthApi = {
  initialUser: null,

  async login(email, password): Promise<LoginOutcome> {
    const res = await http.post<MeDto | { two_factor: TwoFactorMethod }>('/auth/login/', { email, password }, { skipUnauthorized: true });
    if (res && typeof res === 'object' && 'two_factor' in res && res.two_factor) return { status: 'two_factor', method: res.two_factor };
    return { status: 'ok', user: await acceptAgent(res as MeDto) };
  },

  async verifyTwoFactor(code) {
    return acceptAgent(await http.post<MeDto>('/auth/2fa/', { code }, { skipUnauthorized: true }));
  },

  async resendTwoFactor() {
    await http.post('/auth/2fa/resend/', undefined, { skipUnauthorized: true });
  },

  async fetchMe() {
    try {
      return await acceptAgent(await http.get<MeDto>('/auth/me/', undefined, { skipUnauthorized: true }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },

  async logout() {
    await http.post('/auth/logout/', undefined, { skipUnauthorized: true });
  },
};
