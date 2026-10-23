import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/board-cards.json';
import boards from '../__fixtures__/board-list.json';
import { mapBoardSummary, mapBoardView, type BoardViewDto } from './board';

const view = mapBoardView(fixture as unknown as BoardViewDto);

describe('mapBoardSummary', () => {
  it('lê o quadro e o recorte da equipe', () => {
    expect(mapBoardSummary(boards.results[0]!)).toEqual({ id: 1, name: 'Suporte · semana', slug: 'suporte-semana', teamId: 1, teamSlug: 'suporte' });
  });
  it('quadro geral não tem equipe', () => {
    expect(mapBoardSummary({ id: 2, name: 'Geral', slug: 'geral', team: null, team_slug: null })).toMatchObject({ teamId: undefined, teamSlug: undefined });
  });
});

describe('mapBoardView (resposta real do backend)', () => {
  it('colunas de status carregam cor, categoria e conclusão', () => {
    const closed = view.columns.find((c) => c.key === '4')!;
    expect(closed).toMatchObject({ kind: 'stage', stageId: 4, concludes: true, category: 'solved', wipLimit: null });
    const pending = view.columns.find((c) => c.key === '3')!;
    expect(pending.category).toBe('pending');
    expect(pending.color).toMatch(/^#/);
  });

  it('coluna de organização não tem cor de status e traz o limite', () => {
    const lane = view.columns.find((c) => c.kind === 'lane')!;
    expect(lane).toMatchObject({ key: 'lane-3', laneId: 3, color: undefined, category: undefined, concludes: false, wipLimit: 2 });
  });

  it('cartão fixado numa coluna de organização mantém o status verdadeiro em stageKey', () => {
    const card = view.cards.find((c) => c.ticketId === 176)!;
    expect(card).toMatchObject({ reference: 'TD-00176', columnKey: 'lane-3', stageKey: '2', category: 'open', priority: 'high', overdue: false, dueAt: undefined });
    expect(card.sla?.target).toBeDefined();
  });

  it('prazo interno vencido vira overdue com a data', () => {
    const card = view.cards.find((c) => c.ticketId === 177)!;
    expect(card).toMatchObject({ dueAt: '2026-10-20T18:00:00Z', overdue: true, columnKey: '2' });
  });

  it('solicitante, empresa e responsável vêm em texto', () => {
    const card = view.cards.find((c) => c.ticketId === 3)!;
    expect(card.requesterName).toBe('Carla Costa');
    expect(card.companyName).toBe('Bravo Educação');
    expect(card.assigneeId).toBeDefined();
    expect(card.assigneeName).toBeTruthy();
  });

  it('prioridade desconhecida cai em normal e campos nulos viram undefined', () => {
    const v = mapBoardView({
      columns: [],
      entries: [{ ...(fixture.entries[0] as object), priority: 'x', company_name: null, assignee_id: null, assignee_name: null, assignee_avatar: null, stage: null, sla: undefined } as never],
    });
    expect(v.cards[0]).toMatchObject({ priority: 'normal', companyName: undefined, assigneeId: undefined, stageKey: null, sla: undefined });
  });
});
