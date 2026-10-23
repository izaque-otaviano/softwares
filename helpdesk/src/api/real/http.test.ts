import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { apiBaseUrl, buildQueryString, getAllPages, http, onUnauthorized, parseRetryAfter, readCsrfToken, relativeNext, request, toApiError } from './http';

const json = (body: unknown, status = 200): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init, headers: init.headers };
};

const clearCookies = () => {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]!.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  clearCookies();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  clearCookies();
});

describe('http: transporte e CSRF', () => {
  it('usa /api/v1 relativo por padrão e envia credenciais', async () => {
    fetchMock.mockImplementation(async () => json({ ok: 1 }));
    expect(await http.get('/tickets/', { status: ['new', 'open'], q: 'oi', vazio: '', nulo: null })).toEqual({ ok: 1 });
    const { url, init } = lastCall();
    expect(url).toBe('/api/v1/tickets/?status=new%2Copen&q=oi');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
  });

  it('respeita VITE_API_URL (sem barra final)', () => {
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8000/');
    expect(apiBaseUrl()).toBe('http://127.0.0.1:8000/api/v1');
  });

  it('lê o cookie csrftoken e o envia como X-CSRFToken só nas escritas', async () => {
    document.cookie = 'csrftoken=abc%20123; path=/';
    expect(readCsrfToken()).toBe('abc 123');
    fetchMock.mockImplementation(async () => json({}));
    await http.get('/x/');
    expect(lastCall().headers['X-CSRFToken']).toBeUndefined();
    for (const fn of [() => http.post('/x/', { a: 1 }), () => http.put('/x/', {}), () => http.patch('/x/', {}), () => http.delete('/x/')]) {
      await fn();
      expect(lastCall().headers['X-CSRFToken']).toBe('abc 123');
    }
    await http.post('/x/', { a: 1 });
    expect(lastCall().headers['Content-Type']).toBe('application/json');
    expect(lastCall().init.body).toBe('{"a":1}');
  });

  it('sem cookie não envia o cabeçalho; multipart não força Content-Type', async () => {
    fetchMock.mockImplementation(async () => json({}));
    const form = new FormData();
    form.append('files', new Blob(['x']), 'a.txt');
    await http.post('/tickets/1/reply/', form);
    const { headers, init } = lastCall();
    expect(headers['X-CSRFToken']).toBeUndefined();
    expect(headers['Content-Type']).toBeUndefined();
    expect(init.body).toBe(form);
  });

  it('204 devolve undefined', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    expect(await http.post('/auth/logout/')).toBeUndefined();
  });

  it('buildQueryString ignora vazios e junta arrays', () => {
    expect(buildQueryString({ a: 1, b: undefined, c: [1, 2], d: false, e: '' })).toBe('?a=1&c=1%2C2&d=false');
    expect(buildQueryString(undefined)).toBe('');
  });
});

describe('http: erros', () => {
  it('{detail} vira a mensagem', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'E-mail ou senha inválidos.' }, 400));
    const err = await http.post('/auth/login/', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'E-mail ou senha inválidos.', status: 400 });
  });

  it('{campo:[msg]} e {campo:msg} viram fieldErrors; a mensagem é a primeira', async () => {
    fetchMock.mockImplementation(async () => json({ subject: ['Este campo é obrigatório.'], body: 'Texto vazio.' }, 400));
    const err = (await http.post('/tickets/', {}).catch((e) => e)) as ApiError;
    expect(err.fieldErrors).toEqual({ subject: ['Este campo é obrigatório.'], body: ['Texto vazio.'] });
    expect(err.message).toBe('Este campo é obrigatório.');
  });

  it('preserva code e os demais dados (cota)', () => {
    const err = toApiError(422, { detail: 'Cota excedida.', code: 'quota_exceeded', used: 5, limit: 5 });
    expect(err.code).toBe('quota_exceeded');
    expect(err.message).toBe('Cota excedida.');
    expect(err.fieldErrors).toEqual({ used: ['5'], limit: ['5'] });
  });

  it('429 do throttle: mensagem do backend, code e espera do cabeçalho Retry-After (e retry_after não vira campo)', async () => {
    const body = { detail: 'Muitas tentativas em pouco tempo. Aguarde 1 hora e tente de novo.', code: 'throttled', retry_after: 3541 };
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3541' } }));
    const err = (await http.post('/auth/login/', {}, { skipUnauthorized: true }).catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 429, code: 'throttled', retryAfter: 3541, message: body.detail });
    expect(err.fieldErrors).toBeUndefined();
  });

  it('retry_after do corpo vale quando o cabeçalho não é legível (CORS) e o cabeçalho vence quando há os dois', () => {
    expect(toApiError(429, { detail: 'x', retry_after: 90.2 }).retryAfter).toBe(91);
    expect(toApiError(429, { detail: 'x', retry_after: 90 }, new Headers({ 'Retry-After': '30' })).retryAfter).toBe(30);
    expect(toApiError(400, { detail: 'x' }).retryAfter).toBeUndefined();
  });

  it('Retry-After aceita segundos e data HTTP; valor inválido é ignorado', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter('Thu, 22 Oct 2026 12:01:30 GMT', now)).toBe(90);
    expect(parseRetryAfter('Thu, 22 Oct 2026 11:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('logo', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });

  it('corpo não JSON/HTML cai na mensagem padrão do status', async () => {
    fetchMock.mockImplementation(async () => new Response('<html>Erro</html>', { status: 500 }));
    const err = (await http.get('/x/').catch((e) => e)) as ApiError;
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/Erro no servidor/);
    expect(toApiError(403, undefined).message).toMatch(/permissão/);
  });

  it('falha de rede vira ApiError status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await http.get('/x/').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 0, code: 'rede' });
  });

  it('tempo esgotado aborta e vira tempo_esgotado', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
        }),
    );
    const p = request('/x/', { timeoutMs: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ status: 0, code: 'tempo_esgotado' });
  });
});

describe('http: 401 global', () => {
  it('dispara os handlers e ainda lança o erro', async () => {
    const handler = vi.fn();
    const off = onUnauthorized(handler);
    fetchMock.mockImplementation(async () => json({ detail: 'Credenciais não fornecidas.' }, 401));
    await expect(http.get('/tickets/')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    await expect(http.get('/tickets/')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skipUnauthorized (login, /auth/me/) não dispara', async () => {
    const handler = vi.fn();
    const off = onUnauthorized(handler);
    fetchMock.mockImplementation(async () => json({ detail: 'x' }, 401));
    await expect(http.get('/auth/me/', undefined, { skipUnauthorized: true })).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('403 não derruba a sessão', async () => {
    const handler = vi.fn();
    const off = onUnauthorized(handler);
    fetchMock.mockImplementation(async () => json({ detail: 'Sem permissão.' }, 403));
    await expect(http.get('/settings/x/')).rejects.toMatchObject({ status: 403 });
    expect(handler).not.toHaveBeenCalled();
    off();
  });
});

describe('http: paginação', () => {
  it('relativeNext tira a origem e o prefixo /api/v1', () => {
    expect(relativeNext('http://127.0.0.1:5173/api/v1/tickets/?limit=2&offset=2')).toBe('/tickets/?limit=2&offset=2');
    expect(relativeNext('/api/v1/tickets/?offset=2')).toBe('/tickets/?offset=2');
  });

  it('getAllPages segue `next` até o fim', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ count: 5, next: 'http://localhost:8000/api/v1/tickets/?limit=2&offset=2', previous: null, results: [1, 2] }))
      .mockResolvedValueOnce(json({ count: 5, next: '/api/v1/tickets/?limit=2&offset=4', previous: 'x', results: [3, 4] }))
      .mockResolvedValueOnce(json({ count: 5, next: null, previous: 'x', results: [5] }));
    expect(await getAllPages<number>('/tickets/', { status: 'open' }, { limit: 2 })).toEqual([1, 2, 3, 4, 5]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/tickets/?limit=2&status=open',
      '/api/v1/tickets/?limit=2&offset=2',
      '/api/v1/tickets/?limit=2&offset=4',
    ]);
  });

  it('maxPages impede laço infinito', async () => {
    fetchMock.mockImplementation(async () => json({ count: 99, next: '/api/v1/x/?offset=1', previous: null, results: [0] }));
    expect(await getAllPages<number>('/x/', {}, { maxPages: 3 })).toHaveLength(3);
  });

  it('erro numa página propaga', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ count: 3, next: '/api/v1/x/?offset=1', previous: null, results: [1] }))
      .mockResolvedValueOnce(json({ detail: 'Falhou.' }, 500));
    await expect(getAllPages('/x/')).rejects.toMatchObject({ status: 500, message: 'Falhou.' });
  });
});
