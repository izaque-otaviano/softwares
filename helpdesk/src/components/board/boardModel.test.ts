import { describe, expect, it } from 'vitest';
import { EMPTY_BOARD_FILTERS, type BoardCard, type BoardColumn, type BoardData } from '@/types/board';
import { buildColumns, countActiveFilters, dateInputToIso, dueText, insertBefore, isoToDateInput, matchesFilters, orderCards, wipState } from './boardModel';
import { onStatusColorClass } from './colorText';

const card = (id: number, over: Partial<BoardCard> = {}): BoardCard => ({
  ticketId: id,
  reference: `TD-${String(id).padStart(5, '0')}`,
  subject: `Assunto ${id}`,
  requesterName: 'Ana Álvares',
  companyName: 'Acme',
  priority: 'normal',
  stageKey: '1',
  columnKey: '1',
  category: 'new',
  overdue: false,
  messageCount: 0,
  attachmentCount: 0,
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
});
const col = (key: string, over: Partial<BoardColumn> = {}): BoardColumn => ({ key, name: `Col ${key}`, kind: 'stage', concludes: false, wipLimit: null, ...over });

describe('filtros e busca', () => {
  it('busca ignora acento e caixa, em referência, assunto, solicitante e empresa', () => {
    const f = { ...EMPTY_BOARD_FILTERS, query: 'alvares acme' };
    expect(matchesFilters(card(1), f)).toBe(true);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, query: 'td-00001' })).toBe(true);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, query: 'inexistente' })).toBe(false);
  });
  it('responsável, sem responsável, prioridade, empresa e só atrasados', () => {
    expect(matchesFilters(card(1, { assigneeId: '5' }), { ...EMPTY_BOARD_FILTERS, assignee: '5' })).toBe(true);
    expect(matchesFilters(card(1, { assigneeId: '5' }), { ...EMPTY_BOARD_FILTERS, assignee: '6' })).toBe(false);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, assignee: 'none' })).toBe(true);
    expect(matchesFilters(card(1, { assigneeId: '5' }), { ...EMPTY_BOARD_FILTERS, assignee: 'none' })).toBe(false);
    expect(matchesFilters(card(1, { priority: 'urgent' }), { ...EMPTY_BOARD_FILTERS, priority: 'urgent' })).toBe(true);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, priority: 'urgent' })).toBe(false);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, company: 'Outra' })).toBe(false);
    expect(matchesFilters(card(1), { ...EMPTY_BOARD_FILTERS, overdueOnly: true })).toBe(false);
    expect(matchesFilters(card(1, { overdue: true }), { ...EMPTY_BOARD_FILTERS, overdueOnly: true })).toBe(true);
  });
  it('conta filtros ativos', () => {
    expect(countActiveFilters(EMPTY_BOARD_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_BOARD_FILTERS, query: ' x ', overdueOnly: true, priority: 'high' })).toBe(3);
    expect(countActiveFilters({ ...EMPTY_BOARD_FILTERS, query: '   ' })).toBe(0);
  });
});

describe('ordem local dentro da coluna', () => {
  it('insertBefore insere antes do alvo, no fim, e tira a ocorrência anterior', () => {
    expect(insertBefore([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(insertBefore([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
    expect(insertBefore([1, 2], 9, 2)).toEqual([1, 9, 2]);
    expect(insertBefore([1, 2], 9, 77)).toEqual([1, 2, 9]);
  });
  it('orderCards põe os novos primeiro e segue a ordem salva nos demais', () => {
    const cards = [card(10), card(11), card(12), card(13)];
    expect(orderCards(cards, [12, 10]).map((c) => c.ticketId)).toEqual([11, 13, 12, 10]);
    expect(orderCards(cards, undefined)).toBe(cards);
  });
  it('buildColumns agrupa por coluna, filtra e guarda o total sem filtros', () => {
    const data: BoardData = { columns: [col('1'), col('2')], cards: [card(1), card(2, { columnKey: '2', overdue: true }), card(3, { columnKey: '2' })] };
    const v = buildColumns(data, { ...EMPTY_BOARD_FILTERS, overdueOnly: true }, { '2': [3, 2] });
    expect(v.map((c) => [c.cards.length, c.total])).toEqual([[0, 1], [1, 2]]);
    expect(buildColumns(data, EMPTY_BOARD_FILTERS, { '2': [3, 2] })[1]!.cards.map((c) => c.ticketId)).toEqual([3, 2]);
  });
});

describe('limite de trabalho e datas', () => {
  it('wipState', () => {
    expect(wipState(col('1'), 9)).toBe('none');
    expect(wipState(col('1', { wipLimit: 3 }), 2)).toBe('ok');
    expect(wipState(col('1', { wipLimit: 3 }), 3)).toBe('at');
    expect(wipState(col('1', { wipLimit: 3 }), 4)).toBe('over');
  });
  it('dueText', () => {
    const now = new Date(2026, 9, 22, 10);
    expect(dueText(new Date(2026, 9, 22, 18).toISOString(), now)).toBe('Hoje');
    expect(dueText(new Date(2026, 9, 23, 9).toISOString(), now)).toBe('Amanhã');
    expect(dueText(new Date(2026, 9, 21, 9).toISOString(), now)).toBe('Ontem');
    expect(dueText(new Date(2026, 9, 5, 9).toISOString(), now)).toBe('05/10');
  });
  it('data do campo vira 18h local e volta igual', () => {
    const iso = dateInputToIso('2026-10-30')!;
    expect(isoToDateInput(iso)).toBe('2026-10-30');
    expect(new Date(iso).getHours()).toBe(18);
    expect(dateInputToIso('')).toBeNull();
    expect(isoToDateInput(undefined)).toBe('');
  });
});

describe('contraste do texto do cabeçalho', () => {
  it('token new e cores claras usam texto escuro; escuras usam branco', () => {
    expect(onStatusColorClass('new')).toBe('text-fg-inverse');
    expect(onStatusColorClass('open')).toBe('text-fg-inverse');
    expect(onStatusColorClass('#E9A23B')).toBe('text-note-badgeText');
    expect(onStatusColorClass('#39434B')).toBe('text-fg-inverse');
  });
});
