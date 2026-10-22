import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { NOT_AGENT_MESSAGE, mapMe, realAuth } from './auth';

const json = (body: unknown, status = 200): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ME = {
  id: 7,
  email: 'agente@demo.test',
  full_name: 'Ana Agente',
  kind: 'internal',
  internal_role: 'supervisor',
  is_internal: true,
  is_admin: false,
  teams: ['suporte'],
  permissions: ['panel.access'],
  avatar_url: null,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('real/auth', () => {
  it('mapMe: id vira string e papéis são normalizados', () => {
    expect(mapMe(ME)).toMatchObject({ id: '7', name: 'Ana Agente', role: 'agent', internalRole: 'supervisor', teams: ['suporte'] });
    expect(mapMe({ ...ME, internal_role: 'admin', is_admin: true }).role).toBe('admin');
    expect(mapMe({ ...ME, full_name: '' }).name).toBe('agente@demo.test');
  });

  it('login sem 2FA devolve o usuário', async () => {
    fetchMock.mockResolvedValue(json(ME));
    const res = await realAuth.login('agente@demo.test', 'segredo');
    expect(res).toMatchObject({ status: 'ok', user: { id: '7' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/login/');
    expect(JSON.parse(init.body)).toEqual({ email: 'agente@demo.test', password: 'segredo' });
  });

  it('login com {two_factor} pede o código; o código conclui', async () => {
    fetchMock.mockResolvedValueOnce(json({ two_factor: 'email' })).mockResolvedValueOnce(json(ME));
    expect(await realAuth.login('a@b.c', 'x')).toEqual({ status: 'two_factor', method: 'email' });
    expect(await realAuth.verifyTwoFactor('123456')).toMatchObject({ id: '7' });
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/2fa/');
  });

  it('rejeita cliente (kind client) e derruba a sessão criada', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...ME, kind: 'client', is_internal: false })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const err = (await realAuth.login('c@cliente.test', 'x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe(NOT_AGENT_MESSAGE);
    expect(err.code).toBe('not_agent');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/logout/');
  });

  it('fetchMe: 401 vira null; outros erros propagam', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'x' }, 401));
    expect(await realAuth.fetchMe()).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ detail: 'x' }, 500));
    await expect(realAuth.fetchMe()).rejects.toMatchObject({ status: 500 });
  });
});
