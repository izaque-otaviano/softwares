import type { AuthApi, SessionUser } from '../session';
import { ME_ID } from './data/clock';
import { agents, groups } from './data';

const me = agents.find((a) => a.id === ME_ID);

/** Agente fixo do modo mock: login automático, sem tela. */
export const MOCK_SESSION_USER: SessionUser = {
  id: ME_ID,
  name: me?.name ?? 'Marina Alves',
  email: me?.email ?? 'marina.alves@helpdesk.test',
  role: 'agent',
  internalRole: 'agent',
  teams: groups.filter((g) => g.agentIds.includes(ME_ID)).map((g) => g.id),
  permissions: [],
};

export const mockAuth: AuthApi = {
  initialUser: MOCK_SESSION_USER,
  login: async () => ({ status: 'ok', user: MOCK_SESSION_USER }),
  verifyTwoFactor: async () => MOCK_SESSION_USER,
  resendTwoFactor: async () => {},
  fetchMe: async () => MOCK_SESSION_USER,
  logout: async () => {},
};
