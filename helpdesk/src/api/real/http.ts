import { ApiError } from '../errors';

/** Cliente HTTP do backend Resolv: sessão Django em cookie + CSRF (sem token/JWT). */

const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 25_000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIES = ['csrftoken', '__Host-resolv_csrf'];

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Objeto vira JSON; FormData segue como multipart (sem Content-Type manual). */
  body?: unknown;
  /** Parâmetros de query. `undefined`/`null`/'' são omitidos; arrays viram lista separada por vírgula. */
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Não dispara o logout global no 401 (login, /auth/me/). */
  skipUnauthorized?: boolean;
}

/** Envelope de listas paginadas (`LimitOffsetComTeto`). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Base da API: `VITE_API_URL` (ex.: http://127.0.0.1:8000) + `/api/v1`; vazio = relativo (proxy do Vite). */
export function apiBaseUrl(): string {
  const root = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
  return `${root}${API_PREFIX}`;
}

/** Valor do cookie CSRF (null se ausente). */
export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const jar = new Map(
    document.cookie
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf('=');
        return [i < 0 ? c : c.slice(0, i), i < 0 ? '' : decodeURIComponent(c.slice(i + 1))] as const;
      }),
  );
  for (const name of CSRF_COOKIES) {
    const v = jar.get(name);
    if (v) return v;
  }
  return null;
}

type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

/** Registra o tratamento global de 401 (sessão expirada). Devolve a função que remove o handler. */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

export function buildQueryString(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Array.isArray(raw) ? raw.join(',') : String(raw);
    if (value !== '') params.set(key, value);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

const FALLBACK_BY_STATUS: Record<number, string> = {
  400: 'Dados inválidos. Revise e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Não encontrado.',
  409: 'Esta ação entra em conflito com o estado atual.',
  422: 'Não foi possível processar os dados enviados.',
  429: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
};

const asList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== undefined && x !== '').map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));

/** Segundos de espera do cabeçalho `Retry-After` (inteiro ou data HTTP). `undefined` se ausente ou inválido. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Converte o corpo de erro do Resolv ({detail} | {campo:[msg]} | {campo:msg} | [msg]) em ApiError.
 * A espera do 429 vem do cabeçalho `Retry-After` (`headers`) ou de `retry_after` no corpo.
 */
export function toApiError(status: number, body: unknown, headers?: Pick<Headers, 'get'> | null): ApiError {
  let message: string | undefined;
  let code: string | undefined;
  let fieldErrors: Record<string, string[]> | undefined;
  let retryAfter = parseRetryAfter(headers?.get('Retry-After'));
  if (typeof body === 'string' && body.trim() && !body.trimStart().startsWith('<')) {
    message = body.trim();
  } else if (Array.isArray(body)) {
    message = asList(body)[0];
  } else if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.code === 'string') code = obj.code;
    if (retryAfter === undefined && typeof obj.retry_after === 'number' && Number.isFinite(obj.retry_after) && obj.retry_after >= 0) retryAfter = Math.ceil(obj.retry_after);
    if (typeof obj.detail === 'string' && obj.detail) message = obj.detail;
    const fields: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'detail' || key === 'code' || key === 'retry_after') continue;
      const list = asList(value);
      if (list.length > 0) fields[key] = list;
    }
    if (Object.keys(fields).length > 0) {
      fieldErrors = fields;
      message ??= (fields.non_field_errors ?? Object.values(fields)[0])?.[0];
    }
  }
  // 403 = autenticado sem permissão (RBAC): sempre a mesma frase clara, com o motivo do backend em seguida.
  if (status === 403) {
    const reason = message && !/permiss/i.test(message) ? ` ${message}` : '';
    message = `${FALLBACK_BY_STATUS[403]}${reason}`;
  }
  return new ApiError(message ?? FALLBACK_BY_STATUS[status] ?? (status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível concluir a operação.'), {
    status,
    code,
    fieldErrors,
    body,
    retryAfter,
  });
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Requisição à API. Devolve o JSON (ou `undefined` em 204); lança ApiError em qualquer falha. */
export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}${buildQueryString(opts.query)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'include', signal: controller.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ApiError(
      timedOut ? 'O servidor demorou demais para responder. Tente novamente.' : 'Sem conexão com o servidor. Verifique sua rede e tente novamente.',
      { status: 0, code: timedOut ? 'tempo_esgotado' : 'rede' },
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const data = await readBody(res);
  if (!res.ok) {
    if (res.status === 401 && !opts.skipUnauthorized) unauthorizedHandlers.forEach((h) => h());
    throw toApiError(res.status, data, res.headers);
  }
  return data as T;
}

type BodyOpts = Omit<RequestOptions, 'method' | 'body'>;

export const http = {
  get: <T = unknown>(path: string, query?: RequestOptions['query'], opts: BodyOpts = {}) => request<T>(path, { ...opts, query }),
  post: <T = unknown>(path: string, body?: unknown, opts: BodyOpts = {}) => request<T>(path, { ...opts, method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown, opts: BodyOpts = {}) => request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T = unknown>(path: string, body?: unknown, opts: BodyOpts = {}) => request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T = unknown>(path: string, opts: BodyOpts = {}) => request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Caminho relativo à base da API a partir do `next` do envelope (que pode vir absoluto). */
export function relativeNext(next: string): string {
  let rest = next;
  if (/^https?:\/\//i.test(next)) {
    const u = new URL(next);
    rest = u.pathname + u.search;
  }
  return rest.startsWith(API_PREFIX) ? rest.slice(API_PREFIX.length) : rest;
}

/** Percorre todas as páginas ({count,next,...}) e junta os `results`. `maxPages` evita laço infinito. */
export async function getAllPages<T>(
  path: string,
  query: RequestOptions['query'] = {},
  opts: { limit?: number; maxPages?: number } & BodyOpts = {},
): Promise<T[]> {
  const { limit = 200, maxPages = 100, ...rest } = opts;
  const out: T[] = [];
  let page = await http.get<Paginated<T>>(path, { limit, ...query }, rest);
  out.push(...page.results);
  for (let i = 1; page.next && i < maxPages; i++) {
    page = await http.get<Paginated<T>>(relativeNext(page.next), undefined, rest);
    out.push(...page.results);
  }
  return out;
}
