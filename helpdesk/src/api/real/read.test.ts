import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import companies from './__fixtures__/companies.json';
import macros from './__fixtures__/macros.json';
import roster from './__fixtures__/teams-roster.json';
import searchPreview from './__fixtures__/search-preview-fatura.json';
import statuses from './__fixtures__/statuses.json';
import summary from './__fixtures__/summary.json';
import teams from './__fixtures__/teams.json';
import ticket1 from './__fixtures__/ticket-1.json';
import ticket2 from './__fixtures__/ticket-2.json';
import ticket3 from './__fixtures__/ticket-3.json';
import ticket5 from './__fixtures__/ticket-5.json';
import tickets from './__fixtures__/tickets.json';
import usersClient from './__fixtures__/users-client.json';
import usersInternal from './__fixtures__/users-internal.json';
import tags from './__fixtures__/tags.json';
import { ApiError } from '../errors';
import * as realMacros from './macros';
import * as realMeta from './meta';
import * as realMembers from './members';
import * as realOrgs from './orgs';
import { resetLocalLayers } from './local';
import { resetRealCache } from './refs';
import * as realSearch from './search';
import * as realTickets from './tickets';
import * as realUsers from './users';

type Json = unknown;
const envelope = (results: Json[], count = results.length) => ({ count, next: null, previous: null, results });
const ticketList = tickets.results as { id: number; requester_display: string; requester_id: number | null }[];
const DETAILS: Record<number, Json> = { 1: ticket1, 2: ticket2, 3: ticket3, 5: ticket5 };

interface Opts {
  extraClients?: unknown[];
  forbidSettingsUsers?: boolean;
  ticketCount?: number;
  personalViews?: unknown[];
  restrictFirst?: boolean;
  relatedPage?: number;
}
let calls: { method: string; path: string; query: URLSearchParams }[] = [];
let opts: Opts = {};

function route(method: string, path: string, q: URLSearchParams): { status?: number; body: Json } {
  if (method !== 'GET') return { status: 500, body: { detail: 'escrita inesperada' } };
  const p = path.replace('/api/v1', '');
  if (p === '/tickets/') {
    if (q.get('q') === 'fatura') return { body: envelope([ticketList.find((t) => t.id === 6)!]) };
    if (q.get('view') === 'sem-atendimento') return { body: envelope([ticketList[0]!]) };
    if (q.get('status') === 'pending_customer') return { body: envelope([ticketList.find((t) => t.id === 3)!], 1) };
    if (q.get('requester') || q.get('company')) {
      // o servidor filtra por solicitante/empresa e pagina (page size fixo de 2 para exercitar a paginação)
      const all = ticketList.filter((t) => (!q.get('requester') || String(t.requester_id) === q.get('requester')) && (!q.get('company') || String((t as { company_id?: number }).company_id) === q.get('company')));
      const offset = Number(q.get('offset') ?? 0);
      const page = all.slice(offset, offset + (opts.relatedPage ?? 100));
      return { body: { count: all.length, next: offset + page.length < all.length ? 'more' : null, previous: null, results: page } };
    }
    const list = opts.restrictFirst ? ticketList.map((t, i) => (i === 0 ? { ...t, requester_display: 'Usuário protegido', requester_id: null, company_id: null, company_name: null, content_hidden: true } : t)) : ticketList;
    return { body: envelope(list, opts.ticketCount ?? list.length) };
  }
  const detail = /^\/tickets\/(\d+)\/$/.exec(p);
  if (detail) {
    const id = Number(detail[1]);
    const known = DETAILS[id];
    if (known) return { body: known };
    const item = ticketList.find((t) => t.id === id);
    if (!item) return { status: 404, body: { detail: 'Não encontrado.' } };
    return { body: { ...item, messages: [], events: [], watchers: [], requester: { id: item.requester_id ?? 5, name: item.requester_display, email: 'x@y.z' } } };
  }
  if (p === '/tickets/resumo/') return { body: summary };
  if (p === '/ticket-views/') return { body: opts.personalViews ?? [] };
  if (p === '/settings/statuses/') return { body: statuses };
  if (p === '/settings/tags/') return { body: tags };
  if (p === '/settings/teams/roster/') return { body: roster };
  if (p === '/settings/teams/') return { body: teams };
  if (p === '/teams/') return { body: teams.results };
  if (p === '/settings/users/') {
    if (opts.forbidSettingsUsers) return { status: 403, body: { detail: 'Sem permissão.' } };
    const kind = q.get('kind');
    if (kind === 'client') return { body: envelope([...usersClient.results, ...(opts.extraClients ?? [])]) };
    return { body: kind === 'internal' ? usersInternal : envelope([...usersClient.results, ...usersInternal.results]) };
  }
  if (p === '/users/') return { body: (q.get('kind') === 'client' ? usersClient.results : usersInternal.results).map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, kind: u.kind, internal_role: u.internal_role, company: u.company })) };
  const user = /^\/settings\/users\/(\d+)\/$/.exec(p);
  if (user) {
    const u = [...usersClient.results, ...usersInternal.results].find((x) => x.id === Number(user[1]));
    return u ? { body: u } : { status: 404, body: { detail: 'Não encontrado.' } };
  }
  if (p === '/settings/companies/') return { body: companies };
  if (p === '/settings/ticket-macros/') return { body: macros };
  if (p === '/search/') return { body: q.get('q') === 'fatura' ? searchPreview : { tickets: [], companies: [{ id: 2, name: 'Bravo Educação', slug: 'bravo' }], requesters: [] } };
  return { status: 404, body: { detail: `sem rota ${p}` } };
}

beforeEach(() => {
  calls = [];
  opts = {};
  resetRealCache();
  resetLocalLayers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://127.0.0.1');
      calls.push({ method: init?.method ?? 'GET', path: u.pathname, query: u.searchParams });
      const { status = 200, body } = route(init?.method ?? 'GET', u.pathname, u.searchParams);
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const detailCalls = () => calls.filter((c) => /^\/api\/v1\/tickets\/\d+\/$/.test(c.path));

describe('real/tickets: histórico de cliente e organização direto no servidor', () => {
  it('requesterId vai como ?requester= e NÃO depende da lista inicial', async () => {
    const list = await realTickets.listTickets({ requesterId: '5' });
    expect(list.map((t) => t.id)).toEqual([1, 6, 5]);
    const calls_ = calls.filter((c) => c.path === '/api/v1/tickets/');
    expect(calls_).toHaveLength(1);
    expect(calls_[0]!.query.get('requester')).toBe('5');
    expect(calls_[0]!.query.get('company')).toBeNull();
  });

  it('orgId vai como ?company= e traz os tickets de todos os solicitantes da empresa', async () => {
    const list = await realTickets.listTickets({ orgId: '1' });
    expect(list.map((t) => t.id).sort()).toEqual([1, 2, 5, 6]);
    expect(calls.find((c) => c.path === '/api/v1/tickets/')!.query.get('company')).toBe('1');
  });

  it('segue as páginas do servidor até acabar (além da 1ª página)', async () => {
    opts.relatedPage = 2;
    const list = await realTickets.listTickets({ requesterId: '5' });
    expect(list.map((t) => t.id)).toEqual([1, 6, 5]);
    const offsets = calls.filter((c) => c.path === '/api/v1/tickets/').map((c) => c.query.get('offset'));
    expect(offsets).toEqual(['0', '2']);
  });

  it('combina com os demais filtros (status) no navegador', async () => {
    const list = await realTickets.listTickets({ requesterId: '5', statusIds: ['2'] });
    expect(list.map((t) => t.id)).toEqual([6, 5]);
  });

  it('id sem par no backend (local) devolve vazio sem chamar o servidor', async () => {
    expect(await realTickets.listTickets({ requesterId: 'u-local' })).toEqual([]);
    expect(calls.filter((c) => c.path === '/api/v1/tickets/')).toHaveLength(0);
  });
});

describe('real/tickets: lista', () => {
  it('carrega tudo e lê requester_id/company_id da lista, sem chamar o detalhe', async () => {
    const list = await realTickets.listTickets();
    expect(list).toHaveLength(6);
    expect(list.map((t) => [t.id, t.requesterId, t.orgId])).toEqual([[1, '5', '1'], [6, '5', '1'], [2, '6', '1'], [3, '7', '2'], [4, '8', '3'], [5, '5', '1']]);
    expect(detailCalls()).toHaveLength(0);
    expect(list.every((t) => t.detailed === false && t.comments.length === 0)).toBe(true);
    expect(list.find((t) => t.id === 5)!.statusId).toBe('2'); // reaberto: o backend novo troca a coluna junto
    expect(list.find((t) => t.id === 3)!.statusId).toBe('3');
    expect(list.find((t) => t.id === 6)).toMatchObject({ assigneeId: '4', assigneeGroupId: '2', reference: 'TD-00006' });
  });

  it('homônimos (mesmo nome e empresa) NÃO geram chamadas ao detalhe: o id vem da lista', async () => {
    opts.extraClients = [{ ...usersClient.results[0]!, id: 55, email: 'ana2@acme.test' }];
    const list = await realTickets.listTickets();
    expect(list.filter((t) => t.requesterName === 'Ana Almeida').map((t) => t.requesterId)).toEqual(['5', '5', '5']);
    expect(detailCalls()).toHaveLength(0);
  });

  it('ticket restrito (requester_id nulo): fica sem solicitante, mostra o nome mascarado e não chama o detalhe', async () => {
    opts.restrictFirst = true;
    const list = await realTickets.listTickets();
    expect(list.find((t) => t.id === 1)).toMatchObject({ requesterId: '', requesterName: 'Usuário protegido', orgId: undefined });
    expect(detailCalls()).toHaveLength(0);
  });

  it('diretório de clientes sem permissão (403): a lista não depende dele', async () => {
    opts.forbidSettingsUsers = true;
    const list = await realTickets.listTickets();
    expect(list.find((t) => t.id === 3)!.requesterId).toBe('7');
    expect(calls.some((c) => c.path.includes('/users/'))).toBe(false);
  });

  it('lista inicial carrega só a 1ª página (HOME_PAGE) e marca truncated se o total for maior', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    opts.ticketCount = 1200;
    await realTickets.listTickets();
    const ticketCalls = calls.filter((c) => c.path === '/api/v1/tickets/');
    expect(ticketCalls).toHaveLength(1);
    expect(ticketCalls[0]!.query.get('limit')).toBe(String(realTickets.HOME_PAGE));
    expect(ticketCalls[0]!.query.get('offset') ?? '0').toBe('0');
    // o servidor de mentira devolve 6 por página
    expect(realTickets.loadInfo).toMatchObject({ total: 1200, loaded: 6, truncated: true });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it('filtros do facade (solicitante, responsável, texto sem acento)', async () => {
    expect((await realTickets.listTickets({ requesterId: '5' })).map((t) => t.id)).toEqual([1, 6, 5]);
    expect((await realTickets.listTickets({ assigneeId: '3' })).map((t) => t.id)).toEqual([2, 3, 4, 5]);
    expect((await realTickets.listTickets({ query: 'cobranca' })).map((t) => t.id)).toEqual([6]);
    expect((await realTickets.listTickets({ query: 'td-00003' })).map((t) => t.id)).toEqual([3]);
  });
});

describe('real/tickets: detalhe', () => {
  it('traz mensagens em HTML, eventos e solicitante', async () => {
    const t = await realTickets.getTicket(2);
    expect(t.detailed).toBe(true);
    expect(t.requesterId).toBe('6');
    expect(t.comments.map((c) => c.bodyHtml)).toEqual(['<p>Como conecto o CRM de vocês ao nosso funil?</p>', '<p>Olá! Pode me dizer qual CRM vocês usam?</p>']);
    expect(t.comments.map((c) => c.authorId)).toEqual(['6', '3']);
  });

  it('404 vira ApiError', async () => {
    await expect(realTickets.getTicket(999)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('real/tickets: visões', () => {
  it('lista as visões do Helpdesk, as do sistema e as pessoais', async () => {
    opts.personalViews = [{ id: 4, name: 'Urgentes', filters: { priority: 'urgent' }, position: 1, count: 3 }];
    const views = await realTickets.listViews();
    expect(views.slice(0, 6).map((v) => v.id)).toEqual(['mine', 'unassigned', 'all-unsolved', 'recent', 'pending', 'solved-recent']);
    expect(views.find((v) => v.id === 'mine')?.query).toEqual({ view: 'meus-nao-resolvidos' });
    expect(views.find((v) => v.id === 'recent')?.query).toBeUndefined();
    expect(views.find((v) => v.id === 'pv:4')).toMatchObject({ name: 'Urgentes', query: { priority: 'urgent' }, origin: 'personal' });
    expect(views.find((v) => v.id === 'sys:aguardando-voce')?.query).toEqual({ view: 'aguardando-voce' });
  });

  it('contadores: resumo do servidor, visão pessoal e count de "pendentes"', async () => {
    opts.personalViews = [{ id: 4, name: 'Urgentes', filters: {}, count: 3 }];
    const counts = await realTickets.getViewCounts();
    expect(counts).toMatchObject({ mine: 0, unassigned: 1, 'all-unsolved': 5, pending: 1, 'sys:todos': 6, 'pv:4': 3 });
    expect(counts.recent).toBeUndefined();
  });

  it('contadores nunca falham, mesmo sem resumo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"x"}', { status: 500 })));
    await expect(realTickets.getViewCounts()).resolves.toEqual({});
  });

  it('visões com query (sistema e Helpdesk com par no servidor) vão ao REST; locais avaliam no navegador', async () => {
    expect((await realTickets.runView('sys:sem-atendimento')).map((t) => t.id)).toEqual([1]);
    expect(calls.some((c) => c.query.get('view') === 'sem-atendimento')).toBe(true);
    calls = [];
    // unassigned agora tem query view=nao-atribuidos
    await realTickets.runView('unassigned');
    expect(calls.some((c) => c.query.get('view') === 'nao-atribuidos')).toBe(true);
    expect(realTickets.viewPageMeta.unassigned?.hasMore).toBeDefined();
    // recent continua local (sem query): avalia sobre a lista global já em cache. Agora que as visões do servidor não
    // carregam mais a lista global como efeito colateral, o cache é aquecido explicitamente (como o boot da store faz).
    await realTickets.listTickets();
    calls = [];
    await realTickets.runView('recent');
    expect(calls.filter((c) => c.path === '/api/v1/tickets/')).toHaveLength(0);
    await expect(realTickets.runView('nao-existe')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('real: pessoas, empresas, grupos, status, macros, membros', () => {
  it('usuários: clientes, agentes e filtros', async () => {
    expect((await realUsers.listUsers({ role: 'end_user' })).map((u) => u.name)).toEqual(['Ana Almeida', 'Beto Barros', 'Carla Costa', 'Davi Dias']);
    expect((await realUsers.listUsers({ role: 'agent' })).map((u) => u.name).sort()).toEqual(['Fátima Financeiro', 'Samuel Suporte', 'Sofia Supervisora']);
    expect((await realUsers.listUsers({ query: 'beto' })).map((u) => u.id)).toEqual(['6']);
    expect((await realUsers.listUsers({ orgId: '1' })).map((u) => u.id)).toEqual(['5', '6']);
    expect((await realUsers.getUser('7')).email).toBe('carla@bravo.test');
    await expect(realUsers.getUser('999')).rejects.toBeInstanceOf(ApiError);
  });

  it('organizações, grupos, status e macros', async () => {
    expect((await realOrgs.listOrgs()).map((o) => o.name)).toEqual(['Acme Marketing', 'Bravo Educação', 'Cetus Contábil']);
    expect((await realOrgs.getOrg('2')).name).toBe('Bravo Educação');
    expect((await realMeta.listGroups()).map((g) => [g.id, g.agentIds.length])).toEqual([['1', 2], ['2', 2], ['3', 0]]);
    expect((await realMeta.listStatuses()).map((s) => s.category)).toEqual(['new', 'open', 'pending', 'solved']);
    expect((await realMacros.listMacros()).map((m) => m.name)).toContain('Pedir mais informação');
    expect((await realMacros.getMacro('1')).actions.publicReply).toContain('{{solicitante}}');
  });

  it('membros, funções e grupos (Admin)', async () => {
    const members = await realMembers.listMembers();
    expect(members.map((m) => m.name).sort()).toEqual(['Alice Admin', 'Fátima Financeiro', 'Samuel Suporte', 'Sofia Supervisora']);
    expect(members.find((m) => m.name === 'Sofia Supervisora')).toMatchObject({ roleLabel: 'Supervisor', groups: ['Suporte', 'Financeiro'] });
    expect((await realMembers.listRoles()).find((r) => r.id === 'agent')?.members).toBe(2);
    expect((await realMembers.listGroupRows())[0]).toMatchObject({ name: 'Suporte', members: 2 });
    expect(await realMembers.getLicenses()).toEqual({ used: 3, total: 5 });
  });
});

describe('real/search', () => {
  it('prévia (/search/): tickets completos do cache, clientes e empresas', async () => {
    const r = await realSearch.search('fatura');
    expect(r.tickets.map((t) => t.id)).toEqual([6]);
    expect(calls.some((c) => c.path === '/api/v1/search/' && c.query.get('q') === 'fatura')).toBe(true);
    const o = await realSearch.search('bravo');
    expect(o.orgs.map((x) => x.name)).toEqual(['Bravo Educação']);
  });

  it('completa: tickets pelo servidor (?q=), clientes e empresas pelo diretório', async () => {
    const r = await realSearch.search('fatura', { full: true });
    expect(r.tickets.map((t) => t.id)).toEqual([6]);
    expect(calls.some((c) => c.path === '/api/v1/tickets/' && c.query.get('q') === 'fatura')).toBe(true);
    const people = await realSearch.search('ana', { full: true });
    expect(people.users.map((u) => u.name)).toEqual(['Ana Almeida']);
  });

  it('termo curto não vai ao servidor; operadores e #id usam os tickets carregados', async () => {
    expect(await realSearch.search('a')).toEqual({ tickets: [], users: [], orgs: [] });
    expect(calls.filter((c) => c.path === '/api/v1/search/')).toHaveLength(0);
    expect((await realSearch.search('status:pendente')).tickets.map((t) => t.id)).toEqual([3]);
    expect((await realSearch.search('#4')).tickets.map((t) => t.id)).toEqual([4]);
  });
});

describe('real: o que o backend não tem continua LOCAL e nunca chama o backend', () => {
  it('apagar e fundir tickets rodam só no navegador', async () => {
    await realTickets.deleteTickets([1]);
    expect((await realTickets.listTickets()).map((t) => t.id)).not.toContain(1);
    const res = await realTickets.mergeTickets(2, [3]);
    expect(res.sources[0]!.tags).toContain('mesclado');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('fundir usuários e organizações roda só no navegador', async () => {
    await realUsers.mergeUsers('6', '5');
    expect((await realUsers.listUsers({ role: 'end_user' })).map((u) => u.id)).not.toContain('6');
    await realOrgs.mergeOrgs('2', '1');
    expect((await realOrgs.listOrgs()).map((o) => o.id)).not.toContain('2');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});
