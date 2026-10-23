import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deletedFx from './__fixtures__/ticket-deleted.json';
import licensesLimited from './__fixtures__/licenses-limited.json';
import licensesUnlimited from './__fixtures__/licenses-unlimited.json';
import statusesFx from './__fixtures__/statuses.json';
import ticketWithCc from './__fixtures__/ticket-with-cc.json';
import typedList from './__fixtures__/tickets-typed.json';
import { ApiError } from '../errors';
import { resetLocalLayers } from './local';
import * as realMembers from './members';
import { resetRealCache } from './refs';
import * as realTickets from './tickets';

/**
 * Recursos ligados ao backend novo (tipo, apagar/restaurar, CC e seguidores, licenças, resumo de IA) com `fetch`
 * simulado. As respostas de sucesso são as capturadas do backend real (só dados do seed); os erros seguem os formatos
 * do `resolv/docs/ALTERACOES-HELPDESK.md` (400/403/404/409/429/502/503).
 */
type Json = Record<string, any>;
interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Json | undefined;
}
interface Reply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

let calls: Call[] = [];
let handler: (c: Call) => Reply | undefined = () => undefined;

const clone = <T,>(x: T): T => structuredClone(x);
const last = () => calls.filter((c) => c.method !== 'GET').at(-1)!;

beforeEach(() => {
  calls = [];
  handler = () => undefined;
  resetRealCache();
  resetLocalLayers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://127.0.0.1');
      const call: Call = { method: init?.method ?? 'GET', path: u.pathname.replace('/api/v1', ''), query: u.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      const forced = handler(call);
      let res: Reply = forced ?? { status: 404, body: { detail: 'Não encontrado.' } };
      if (!forced && call.method === 'GET' && call.path === '/settings/statuses/') res = { status: 200, body: statusesFx };
      if (call.method !== 'GET' || !call.path.startsWith('/settings/')) calls.push(call);
      return new Response(res.status === 204 ? null : JSON.stringify(res.body ?? {}), { status: res.status, headers: { 'Content-Type': 'application/json', ...(res.headers ?? {}) } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const fail = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('deveria falhar');
};

describe('CC de terceiros (cc/)', () => {
  it('POST cc/ manda o e-mail aparado (e o nome só quando existe) e devolve o ticket com a lista do servidor', async () => {
    handler = (c) => (c.method === 'POST' && c.path === '/tickets/180/cc/' ? { status: 201, body: ticketWithCc } : undefined);
    const t = await realTickets.addTicketCc(180, { email: '  Terceiro@Exemplo.com ', name: ' ' });
    expect(last().body).toEqual({ email: 'Terceiro@Exemplo.com' });
    expect(t.ccIds).toEqual(['terceiro@exemplo.com']);
    expect(t.ccList).toEqual([{ id: '1', name: 'Terceiro Teste', email: 'terceiro@exemplo.com' }]);
    await realTickets.addTicketCc(180, { email: 'a@b.co', name: 'Alice' });
    expect(last().body).toEqual({ email: 'a@b.co', name: 'Alice' });
  });

  it('DELETE cc/{id}/ remove pelo id do registro', async () => {
    handler = (c) => (c.method === 'DELETE' ? { status: 200, body: { ...clone(ticketWithCc), cc: [] } } : undefined);
    const t = await realTickets.removeTicketCc(180, '1');
    expect(`${last().method} ${last().path}`).toBe('DELETE /tickets/180/cc/1/');
    expect(t.ccList).toEqual([]);
  });

  it('400 de e-mail inválido volta por campo (fieldErrors.email)', async () => {
    handler = (c) => (c.method === 'POST' ? { status: 400, body: { email: ['Insira um endereço de email válido.'] } } : undefined);
    const e = await fail(realTickets.addTicketCc(180, { email: 'ruim' }));
    expect(e.status).toBe(400);
    expect(e.fieldErrors?.email).toEqual(['Insira um endereço de email válido.']);
  });

  it('400 do solicitante e do limite de 20 trazem o motivo do servidor', async () => {
    handler = () => ({ status: 400, body: { detail: 'Este e-mail é o do solicitante, que já recebe as respostas.' } });
    expect((await fail(realTickets.addTicketCc(180, { email: 'ana@acme.test' }))).message).toBe('Este e-mail é o do solicitante, que já recebe as respostas.');
    handler = () => ({ status: 400, body: { detail: 'Um ticket aceita no máximo 20 e-mails em cópia.' } });
    expect((await fail(realTickets.addTicketCc(180, { email: 'x@y.co' }))).message).toMatch(/no máximo 20/);
  });

  it('403 (cliente) e 404 viram frases claras', async () => {
    handler = () => ({ status: 403, body: { detail: 'Você não tem permissão para executar essa ação.' } });
    expect((await fail(realTickets.addTicketCc(180, { email: 'x@y.co' }))).message).toMatch(/não tem permissão para alterar o CC/);
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    const e = await fail(realTickets.removeTicketCc(180, '9'));
    expect([e.status, e.message]).toEqual([404, 'Ticket não encontrado.']);
  });
});

describe('seguidores de terceiros (followers/)', () => {
  it('POST followers/ manda user_id numérico e DELETE usa o id na rota', async () => {
    handler = (c) => (c.method === 'POST' ? { status: 201, body: ticketWithCc } : undefined);
    const t = await realTickets.addTicketFollower(180, '2');
    expect(`${last().method} ${last().path}`).toBe('POST /tickets/180/followers/');
    expect(last().body).toEqual({ user_id: 2 });
    expect(t.followerList).toEqual([{ id: '2', name: 'Sofia Supervisora', email: 'supervisor@demo.resolv.test', internal: true }]);
    expect(t.followerIds).toEqual(['2']);
    handler = (c) => (c.method === 'DELETE' ? { status: 200, body: { ...clone(ticketWithCc), followers: [], watchers: [] } } : undefined);
    const gone = await realTickets.removeTicketFollower(180, '2');
    expect(`${last().method} ${last().path}`).toBe('DELETE /tickets/180/followers/2/');
    expect(gone.followerIds).toEqual([]);
  });

  it('400 (solicitante, inativo, cliente de outra empresa) e 404 sobem com a mensagem', async () => {
    handler = () => ({ status: 400, body: { detail: 'O solicitante já acompanha o ticket.' } });
    expect((await fail(realTickets.addTicketFollower(180, '5'))).message).toBe('O solicitante já acompanha o ticket.');
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    expect((await fail(realTickets.removeTicketFollower(180, '77'))).status).toBe(404);
  });
});

describe('apagar (DELETE /tickets/{id}/)', () => {
  it('204: o ticket entra em `deleted`', async () => {
    handler = (c) => (c.method === 'DELETE' ? { status: 204 } : undefined);
    const r = await realTickets.deleteTickets([181, 182]);
    expect(r).toEqual({ deleted: [181, 182], failed: [] });
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(['DELETE /tickets/181/', 'DELETE /tickets/182/']);
  });

  it('403, 404 e 409 ticket_conflict ficam em `failed` com a frase clara e NÃO em `deleted`', async () => {
    handler = (c) => {
      if (c.path === '/tickets/1/') return { status: 403, body: { detail: 'Você não tem permissão para executar essa ação.' } };
      if (c.path === '/tickets/2/') return { status: 404, body: { detail: 'Não encontrado.' } };
      if (c.path === '/tickets/3/') return { status: 409, body: { detail: 'Este ticket tem horas de manutenção lançadas.', code: 'ticket_conflict' } };
      if (c.path === '/tickets/4/') return { status: 204 };
      return { status: 503, body: { detail: 'Serviço indisponível.' } };
    };
    const r = await realTickets.deleteTickets([1, 2, 3, 4, 5]);
    expect(r.deleted).toEqual([4]);
    expect(r.failed.map((f) => [f.id, f.status])).toEqual([[1, 403], [2, 404], [3, 409], [5, 503]]);
    expect(r.failed[0]!.message).toBe('Você não tem permissão para apagar tickets. Só administradores podem apagar o ticket #1.');
    expect(r.failed[1]!.message).toMatch(/#2 não foi encontrado: ele pode já ter sido apagado/);
    expect(r.failed[2]!.message).toBe('O ticket #3 não pode ser apagado. Este ticket tem horas de manutenção lançadas.');
    expect(r.failed[2]!.code).toBe('ticket_conflict');
    expect(r.failed[3]!.message).toMatch(/Não foi possível apagar o ticket #5/);
  });

  it('409 sem texto do servidor ainda explica o motivo (horas lançadas)', async () => {
    handler = () => ({ status: 409, body: { code: 'ticket_conflict' } });
    const r = await realTickets.deleteTickets([7]);
    expect(r.failed[0]!.message).toBe('O ticket #7 não pode ser apagado: ele tem horas de manutenção lançadas.');
  });

  it('sem rede: o ticket não entra em `deleted`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const r = await realTickets.deleteTickets([9]);
    expect(r.deleted).toEqual([]);
    expect(r.failed[0]!.status).toBe(0);
    expect(r.failed[0]!.message).toMatch(/Sem conexão/);
  });
});

describe('restaurar (POST /tickets/{id}/restore/) e ticket apagado (só admin)', () => {
  it('o detalhe de apagado traz deletedAt e quem apagou', async () => {
    handler = (c) => (c.method === 'GET' && c.path === '/tickets/181/' ? { status: 200, body: deletedFx } : undefined);
    const t = await realTickets.getTicket(181);
    expect(t.deletedAt).toBe('2026-10-23T10:27:34.849213-03:00');
    expect(t.deletedByName).toBe('Alice Admin');
  });

  it('200 devolve o ticket sem deletedAt', async () => {
    handler = (c) => (c.method === 'POST' ? { status: 200, body: { ...clone(deletedFx), deleted_at: null, deleted_by_name: null } } : undefined);
    const t = await realTickets.restoreTicket(181);
    expect(`${last().method} ${last().path}`).toBe('POST /tickets/181/restore/');
    expect(t.deletedAt).toBeUndefined();
  });

  it('403, 404 e 409 (passou de 30 dias) viram mensagens claras', async () => {
    handler = () => ({ status: 403, body: { detail: 'Sem permissão.' } });
    expect((await fail(realTickets.restoreTicket(1))).message).toMatch(/Só administradores/);
    handler = () => ({ status: 404, body: { detail: 'Ticket apagado não encontrado.' } });
    expect((await fail(realTickets.restoreTicket(1))).message).toBe('O ticket #1 não está apagado ou não foi encontrado.');
    handler = () => ({ status: 409, body: { detail: 'Passou de 30 dias.', code: 'ticket_conflict' } });
    const e = await fail(realTickets.restoreTicket(1));
    expect([e.status, e.code, e.message]).toEqual([409, 'ticket_conflict', 'Não foi possível restaurar o ticket #1. Passou de 30 dias.']);
  });
});

describe('resumo de IA (POST /tickets/{id}/ai-summary/)', () => {
  const ok = { summary: 'A cliente relata atraso.', generated_at: '2026-10-23T12:00:00Z', provider: 'anthropic', truncated: true };

  it('200: mapeia o resumo, o provedor e o aviso de truncado; não manda corpo', async () => {
    handler = () => ({ status: 200, body: ok });
    const r = await realTickets.generateAiSummary(5);
    expect(r).toEqual({ summary: 'A cliente relata atraso.', generatedAt: '2026-10-23T12:00:00Z', provider: 'anthropic', truncated: true });
    expect(`${last().method} ${last().path}`).toBe('POST /tickets/5/ai-summary/');
    expect(last().body).toBeUndefined();
  });

  it('503 ai_not_configured: frase da conta, com o código preservado', async () => {
    handler = () => ({ status: 503, body: { detail: 'O resumo por IA não está configurado neste ambiente.', code: 'ai_not_configured' } });
    const e = await fail(realTickets.generateAiSummary(5));
    expect([e.status, e.code, e.message]).toEqual([503, 'ai_not_configured', 'O resumo por IA não está configurado nesta conta.']);
  });

  it('502, 429 (com espera), 403 e 404 têm mensagens próprias', async () => {
    handler = () => ({ status: 502, body: { detail: 'Falha do provedor', code: 'ai_provider_error' } });
    expect((await fail(realTickets.generateAiSummary(5))).message).toMatch(/provedor de IA não respondeu/);
    handler = () => ({ status: 429, body: { detail: 'Muitas requisições.' }, headers: { 'Retry-After': '1800' } });
    const rate = await fail(realTickets.generateAiSummary(5));
    expect(rate.message).toBe('Você atingiu o limite de resumos por IA (20 por hora). Tente de novo em 30 min.');
    expect(rate.retryAfter).toBe(1800);
    handler = () => ({ status: 403, body: { detail: 'Sem acesso.' } });
    expect((await fail(realTickets.generateAiSummary(5))).message).toBe('Você não tem permissão para gerar o resumo deste ticket.');
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    expect((await fail(realTickets.generateAiSummary(5))).message).toBe('Ticket não encontrado.');
  });
});

describe('tipo nas visões do servidor (?type=)', () => {
  it('runView junta o tipo à consulta da visão e mapeia o tipo da lista', async () => {
    handler = (c) => {
      if (c.path === '/tickets/' && c.query.get('view') === 'sem-atendimento') return { status: 200, body: typedList };
      if (c.path === '/ticket-views/') return { status: 200, body: [] };
      return undefined;
    };
    const list = await realTickets.runView('sys:sem-atendimento', { type: 'incident,none' });
    const listCall = calls.find((c) => c.path === '/tickets/')!;
    expect(listCall.query.get('type')).toBe('incident,none');
    expect(listCall.query.get('view')).toBe('sem-atendimento');
    expect(list).toHaveLength(typedList.results.length);
    calls = [];
    await realTickets.runView('sys:sem-atendimento');
    expect(calls.find((c) => c.path === '/tickets/')!.query.has('type')).toBe(false);
  });
});

describe('licenças (/settings/licenses/)', () => {
  it('lê limitado e sem limite', async () => {
    handler = () => ({ status: 200, body: licensesLimited });
    expect(await realMembers.getLicenses()).toEqual({ used: 6, total: 8, available: 2, unlimited: false });
    handler = () => ({ status: 200, body: licensesUnlimited });
    expect(await realMembers.getLicenses()).toEqual({ used: 6, total: null, available: null, unlimited: true });
  });

  it('PATCH {total:N} e {total:null}', async () => {
    handler = (c) => ({ status: 200, body: c.body?.total === null ? licensesUnlimited : licensesLimited });
    expect((await realMembers.setLicenseTotal(8)).total).toBe(8);
    expect(last().body).toEqual({ total: 8 });
    expect((await realMembers.setLicenseTotal(null)).unlimited).toBe(true);
    expect(last().body).toEqual({ total: null });
  });

  it('400 seat_total_below_used traz o motivo e o código', async () => {
    handler = () => ({ status: 400, body: { detail: 'O total não pode ser menor que as licenças em uso (6). Desative agentes antes de reduzir.', code: 'seat_total_below_used' } });
    const e = await fail(realMembers.setLicenseTotal(3));
    expect([e.status, e.code]).toEqual([400, 'seat_total_below_used']);
    expect(e.message).toMatch(/menor que as licenças em uso \(6\)/);
  });

  it('403 de quem não é administrador', async () => {
    handler = () => ({ status: 403, body: { detail: 'Apenas administradores.' } });
    expect((await fail(realMembers.setLicenseTotal(9))).message).toMatch(/^Você não tem permissão/);
  });

  it('409 seat_limit_reached ao criar membro: mensagem do servidor e código', async () => {
    handler = () => ({ status: 409, body: { detail: 'O limite de licenças de agente foi atingido (8 de 8). Aumente o total ou desative um agente.', code: 'seat_limit_reached' } });
    const e = await fail(realMembers.createMember({ name: 'AG-front x', email: 'ag-front@x.co', role: 'agent' }));
    expect([e.status, e.code]).toEqual([409, 'seat_limit_reached']);
    expect(e.message).toMatch(/\(8 de 8\)/);
  });

  it('409 seat_limit_reached ao reativar (PATCH is_active:true)', async () => {
    handler = () => ({ status: 409, body: { detail: 'O limite de licenças de agente foi atingido (8 de 8).', code: 'seat_limit_reached' } });
    const e = await fail(realMembers.setMemberSuspended('4', false));
    expect(e.code).toBe('seat_limit_reached');
  });
});
