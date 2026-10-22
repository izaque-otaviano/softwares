import { mockAuth } from './mock/auth';
import { IS_REAL } from './mode';
import { realAuth } from './real/auth';
import type { AuthApi } from './session';

export type { AuthApi, LoginOutcome, SessionUser, TwoFactorMethod } from './session';

/** Autenticação: mock = agente fixo (sem tela de login); real = sessão Django em cookie. */
export const authApi: AuthApi = IS_REAL ? realAuth : mockAuth;
