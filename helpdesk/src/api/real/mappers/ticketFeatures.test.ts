import { describe, expect, it } from 'vitest';
import deletedFx from '../__fixtures__/ticket-deleted.json';
import licensesLimited from '../__fixtures__/licenses-limited.json';
import licensesUnlimited from '../__fixtures__/licenses-unlimited.json';
import statusesFx from '../__fixtures__/statuses.json';
import ticketWithCc from '../__fixtures__/ticket-with-cc.json';
import ticket2 from '../__fixtures__/ticket-2.json';
import typedList from '../__fixtures__/tickets-typed.json';
import { ApiError } from '../../errors';
import type { StatusDto, TicketDetailDto, TicketDto } from './dto';
import { aiSummaryError, ccError, deleteTicketError, mapAiSummary, mapLicenses, mapStatus, mapTicketDetail, mapTicketListItem, mapTicketType, restoreTicketError } from './index';

const statuses = (statusesFx.results as StatusDto[]).map(mapStatus);

describe('tipo, CC, seguidores e apagado no detalhe (fixtures reais)', () => {
  const t = mapTicketDetail(ticketWithCc as unknown as TicketDetailDto, { statuses, staff: [] });

  it('lê o tipo e os contatos do servidor', () => {
    expect(t.type).toBe('problem');
    expect(t.ccList).toEqual([{ id: '1', name: 'Terceiro Teste', email: 'terceiro@exemplo.com' }]);
    expect(t.ccIds).toEqual(['terceiro@exemplo.com']);
    expect(t.followerList).toEqual([{ id: '2', name: 'Sofia Supervisora', email: 'supervisor@demo.resolv.test', internal: true }]);
    expect(t.followerIds).toEqual(['2']);
    expect(t.deletedAt).toBeUndefined();
  });

  it('eventos de auditoria (tipo, CC, seguidor) viram texto sem "De/Para" de status', () => {
    const notes = t.events.filter((e) => /^(tipo|cc|seguidor)/.test(e.text));
    expect(notes.map((e) => e.text)).toEqual(['tipo → Problema', 'cc + terceiro@exemplo.com', 'seguidor + Sofia Supervisora']);
    expect(notes.every((e) => e.kind === 'field_change' && e.meta === undefined)).toBe(true);
  });

  it('criação e troca de status continuam com "De/Para"', () => {
    expect(t.events[0]!.text).toBe('Ticket criado');
    const dto = clone(ticket2) as unknown as TicketDetailDto;
    const changed = mapTicketDetail(dto, { statuses, staff: [] }).events.filter((e) => e.meta);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('ticket apagado (só o admin recebe) traz quando e quem', () => {
    const d = mapTicketDetail(deletedFx as unknown as TicketDetailDto, { statuses, staff: [] });
    expect(d.deletedAt).toBe('2026-10-23T10:27:34.849213-03:00');
    expect(d.deletedByName).toBe('Alice Admin');
    expect(d.type).toBeUndefined(); // nulo = sem tipo
    expect(d.ccList).toEqual([]);
  });

  it('cliente recebe cc/followers vazios (ou ausentes) sem quebrar', () => {
    const dto = { ...clone(ticketWithCc), cc: undefined, followers: undefined } as unknown as TicketDetailDto;
    const c = mapTicketDetail(dto, { statuses, staff: [] });
    expect(c.ccList).toEqual([]);
    expect(c.followerList).toEqual([]);
  });
});

describe('tipo na lista', () => {
  it('mapeia os quatro tipos e trata nulo/desconhecido como sem tipo', () => {
    expect(mapTicketType('question')).toBe('question');
    expect(mapTicketType('incident')).toBe('incident');
    expect(mapTicketType('problem')).toBe('problem');
    expect(mapTicketType('task')).toBe('task');
    expect(mapTicketType(null)).toBeUndefined();
    expect(mapTicketType('outro')).toBeUndefined();
    expect(mapTicketType(undefined)).toBeUndefined();
  });
  it('item da lista filtrada por tipo carrega o tipo', () => {
    const item = typedList.results[0] as unknown as TicketDto;
    expect(item.type).toBe('problem');
    expect(mapTicketListItem(item, { statuses }).type).toBe('problem');
  });
});

describe('licenças', () => {
  it('limitado', () => {
    expect(mapLicenses(licensesLimited)).toEqual({ used: 6, total: 8, available: 2, unlimited: false });
  });
  it('sem limite: total e vagas nulos', () => {
    expect(mapLicenses(licensesUnlimited)).toEqual({ used: 6, total: null, available: null, unlimited: true });
  });
  it('total nulo sem a flag também é sem limite', () => {
    expect(mapLicenses({ total: null, used: 2, available: null, unlimited: false }).unlimited).toBe(true);
  });
});

describe('resumo de IA', () => {
  it('mapeia o corpo', () => {
    expect(mapAiSummary({ summary: 'x', generated_at: '2026-10-23T12:00:00Z', provider: 'anthropic', truncated: false })).toEqual({ summary: 'x', generatedAt: '2026-10-23T12:00:00Z', provider: 'anthropic', truncated: false });
  });
});

describe('mensagens de erro (puras)', () => {
  const api = (status: number, body: unknown = {}, retryAfter?: number) => new ApiError('x', { status, body, retryAfter, code: (body as { code?: string }).code });
  it('apagar', () => {
    expect(deleteTicketError(api(403), 3).message).toMatch(/Só administradores/);
    expect(deleteTicketError(api(404), 3).message).toMatch(/já ter sido apagado/);
    expect(deleteTicketError(api(409, { detail: 'Há horas.', code: 'ticket_conflict' }), 3)).toMatchObject({ code: 'ticket_conflict', message: 'O ticket #3 não pode ser apagado. Há horas.' });
    expect(deleteTicketError(new Error('x'), 3).message).toBe('Não foi possível apagar o ticket #3.');
  });
  it('restaurar', () => {
    expect(restoreTicketError(api(409), 4).message).toMatch(/mais de 30 dias/);
    expect(restoreTicketError(api(404), 4).message).toMatch(/não está apagado/);
  });
  it('resumo de IA: 429 sem espera e espera curta', () => {
    expect(aiSummaryError(api(429)).message).toBe('Você atingiu o limite de resumos por IA (20 por hora). Tente de novo mais tarde.');
    expect(aiSummaryError(api(429, {}, 45)).message).toMatch(/em 45 s/);
    expect(aiSummaryError(api(500)).status).toBe(500);
  });
  it('cc: mantém o 400 do servidor', () => {
    const bad = new ApiError('Insira um endereço de email válido.', { status: 400, fieldErrors: { email: ['Insira um endereço de email válido.'] } });
    expect(ccError(bad)).toBe(bad);
  });
});

function clone<T>(x: T): T {
  return structuredClone(x);
}
