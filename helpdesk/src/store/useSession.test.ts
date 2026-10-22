import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import type { SessionUser } from '@/api/session';

const USER: SessionUser = { id: '7', name: 'Ana Agente', email: 'a@b.c', role: 'agent', teams: ['suporte'], permissions: [] };
const auth = vi.hoisted(() => ({
  initialUser: null as SessionUser | null,
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
  resendTwoFactor: vi.fn(),
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/api/auth', () => ({ authApi: auth }));

const { useSession, getMeId } = await import('./useSession');

beforeEach(() => {
  Object.values(auth).forEach((f) => typeof f === 'function' && 'mockReset' in f && f.mockReset());
  useSession.setState({ status: 'loading', user: null, twoFactor: null, error: null, expired: false });
});

describe('useSession (modo real simulado)', () => {
  it('restore: sessão válida autentica; 401 (null) fica anônimo', async () => {
    auth.fetchMe.mockResolvedValueOnce(USER);
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', user: USER });
    expect(getMeId()).toBe('7');
    auth.fetchMe.mockResolvedValueOnce(null);
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('restore com erro de rede fica anônimo com mensagem', async () => {
    auth.fetchMe.mockRejectedValueOnce(new ApiError('Sem conexão.', { status: 0 }));
    await useSession.getState().restore();
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', error: 'Sem conexão.' });
  });

  it('login ok', async () => {
    auth.login.mockResolvedValueOnce({ status: 'ok', user: USER });
    expect(await useSession.getState().login(' a@b.c ', 'x')).toBe('ok');
    expect(auth.login).toHaveBeenCalledWith('a@b.c', 'x');
    expect(useSession.getState().status).toBe('authenticated');
  });

  it('login com erro guarda a mensagem (inclusive a de conta de cliente)', async () => {
    auth.login.mockRejectedValueOnce(new ApiError('Esta conta é de cliente.', { code: 'not_agent' }));
    expect(await useSession.getState().login('c@c.c', 'x')).toBe('error');
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', user: null, error: 'Esta conta é de cliente.' });
  });

  it('fluxo 2FA: login -> código inválido mantém a etapa -> código certo autentica', async () => {
    auth.login.mockResolvedValueOnce({ status: 'two_factor', method: 'totp' });
    expect(await useSession.getState().login('a@b.c', 'x')).toBe('two_factor');
    expect(useSession.getState()).toMatchObject({ status: 'two_factor', twoFactor: 'totp' });
    auth.verifyTwoFactor.mockRejectedValueOnce(new ApiError('Código inválido.', { status: 400 }));
    expect(await useSession.getState().verifyTwoFactor('000000')).toBe(false);
    expect(useSession.getState()).toMatchObject({ status: 'two_factor', error: 'Código inválido.' });
    auth.verifyTwoFactor.mockResolvedValueOnce(USER);
    expect(await useSession.getState().verifyTwoFactor(' 123456 ')).toBe(true);
    expect(auth.verifyTwoFactor).toHaveBeenLastCalledWith('123456');
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', twoFactor: null });
  });

  it('2FA com sessão pendente expirada (401/403) volta ao login', async () => {
    useSession.setState({ status: 'two_factor', twoFactor: 'email' });
    auth.verifyTwoFactor.mockRejectedValueOnce(new ApiError('Sessão expirada.', { status: 403 }));
    await useSession.getState().verifyTwoFactor('1');
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', twoFactor: null });
  });

  it('reenvio de código', async () => {
    auth.resendTwoFactor.mockResolvedValueOnce(undefined);
    expect(await useSession.getState().resendTwoFactor()).toBe(true);
    auth.resendTwoFactor.mockRejectedValueOnce(new ApiError('Aguarde.'));
    expect(await useSession.getState().resendTwoFactor()).toBe(false);
    expect(useSession.getState().error).toBe('Aguarde.');
  });

  it('logout encerra mesmo se o backend falhar', async () => {
    useSession.setState({ status: 'authenticated', user: USER });
    auth.logout.mockRejectedValueOnce(new ApiError('x'));
    await useSession.getState().logout();
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(getMeId()).toBe('');
  });

  it('expire (401 global) marca a sessão como expirada', () => {
    useSession.setState({ status: 'authenticated', user: USER });
    useSession.getState().expire();
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', user: null, expired: true });
  });
});
