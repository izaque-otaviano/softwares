import { describe, expect, it } from 'vitest';
import { statusIdByCategory } from '@/lib/status';
import type { Group, Ticket, TicketStatus, View } from '@/types/domain';
import { selectMyGroups } from './useMyGroups';
import { keepDetails, mergeCounts } from './useTickets';

const st = (id: string, category: TicketStatus['category'], extra: Partial<TicketStatus> = {}): TicketStatus => ({ id, category, agentName: id, agentDescription: '', endUserName: id, color: '#000', ...extra });
const STATUSES = [st('1', 'new', { system: true }), st('2', 'open', { system: true }), st('9', 'open'), st('3', 'pending', { system: true }), st('4', 'solved', { system: true })];
const ticket = (id: number, extra: Partial<Ticket> = {}): Ticket => ({
  id, subject: 's', requesterId: '', assigneeGroupId: '1', followerIds: [], ccIds: [], tags: [], statusId: '2', channel: 'web_form', formId: 'default', customFields: {}, comments: [], events: [], createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z', ...extra,
});
const view = (id: string, extra: Partial<View> = {}): View => ({ id, name: id, conditions: { all: [] }, columns: [], countKey: id, ...extra });

describe('store (modo real): contadores', () => {
  const ctx = { meId: '1', now: new Date('2026-10-22T12:00:00Z'), statuses: STATUSES };

  it('os contadores do servidor valem; o resto sai da avaliação local; visão do servidor sem contador fica null', () => {
    const views = [
      view('mine', { conditions: { all: [{ field: 'assignee', operator: 'is', value: 'me' }] } }),
      view('recent', { conditions: { all: [{ field: 'updated_within_hours', operator: 'less_than', value: '72' }] } }),
      view('sys:x', { query: { view: 'x' } }),
      view('sys:y', { query: { view: 'y' } }),
    ];
    const tickets = [ticket(1, { assigneeId: '1' }), ticket(2)];
    const out = mergeCounts(views, tickets, ctx, { mine: 99, 'sys:x': 4 });
    expect(out).toEqual({ mine: 99, recent: 2, 'sys:x': 4, 'sys:y': null });
  });
});

describe('store (modo real): recarga da lista', () => {
  it('não perde mensagens de um ticket com detalhe aberto', () => {
    const prev = [ticket(1, { detailed: true, requesterId: '5', comments: [{ id: 'c', authorId: '5', public: true, bodyHtml: '<p>x</p>', channel: 'web_form', attachments: [], createdAt: '' }] })];
    const next = keepDetails(prev, [ticket(1, { detailed: false, priority: 'high' }), ticket(2, { detailed: false })]);
    expect(next[0]).toMatchObject({ id: 1, detailed: true, priority: 'high', requesterId: '5' });
    expect(next[0]!.comments).toHaveLength(1);
    expect(next[1]!.detailed).toBe(false);
  });

  it('no mock (detailed ausente) nada muda', () => {
    const list = [ticket(1)];
    expect(keepDetails([ticket(1)], list)).toEqual(list);
  });
});

describe('status por categoria e grupos do agente', () => {
  it('statusIdByCategory prefere o de sistema; cai no fallback', () => {
    expect(statusIdByCategory(STATUSES, 'solved')).toBe('4');
    expect(statusIdByCategory(STATUSES, 'open')).toBe('2');
    expect(statusIdByCategory([], 'new')).toBe('new');
    expect(statusIdByCategory([], 'solved', 'x')).toBe('x');
  });

  it('me.teams (slugs no real, ids no mock) casam com os grupos', () => {
    const groups: Group[] = [
      { id: '1', name: 'Suporte', agentIds: [], slug: 'suporte' },
      { id: '2', name: 'Financeiro', agentIds: [], slug: 'financeiro' },
      { id: 'g1', name: 'N1', agentIds: [] },
    ];
    expect(selectMyGroups(['suporte'], groups).map((g) => g.id)).toEqual(['1']);
    expect(selectMyGroups(['g1'], groups).map((g) => g.id)).toEqual(['g1']);
    expect(selectMyGroups([], groups)).toEqual([]);
  });
});
