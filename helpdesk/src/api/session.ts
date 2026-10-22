/** Usuário da sessão (agente ou administrador). Mesma forma nos modos mock e real. */
export interface SessionUser {
  /** Id do usuário (mock: 'me'; real: `String(me.id)`). */
  id: string;
  name: string;
  email: string;
  role: 'agent' | 'admin';
  /** Papel detalhado do backend (admin, supervisor, agent, light_agent...). */
  internalRole?: string;
  /** Equipes do usuário (mock: ids dos grupos; real: slugs de `me.teams`). Para obter os grupos use `useMyGroups()` (store/useMyGroups), que casa por `Group.slug`/`Group.id`. */
  teams: string[];
  /** Permissões do backend (`ticket.bulk_actions`, `settings.manage`...). No mock, vazia = tudo liberado. */
  permissions: string[];
  avatarUrl?: string | null;
}

export type TwoFactorMethod = 'email' | 'totp';

export type LoginOutcome = { status: 'ok'; user: SessionUser } | { status: 'two_factor'; method: TwoFactorMethod };

/** Contrato dos módulos auth (mock e real). */
export interface AuthApi {
  /** Usuário já conhecido sem rede: mock devolve o agente fixo; real devolve null (precisa de /auth/me/). */
  initialUser: SessionUser | null;
  login(email: string, password: string): Promise<LoginOutcome>;
  verifyTwoFactor(code: string): Promise<SessionUser>;
  resendTwoFactor(): Promise<void>;
  /** Sessão atual; `null` quando não há sessão (401). */
  fetchMe(): Promise<SessionUser | null>;
  logout(): Promise<void>;
}
