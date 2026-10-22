import { describe, expect, it } from 'vitest';
import { statuses, tickets, users } from '@/mocks';
import { applyFilters, buildCsv, EMPTY_FILTERS, sortTickets, type Lookups } from './viewQuery';

const lk: Lookups = { statuses, users: new Map(users.map((u) => [u.id, u])) };

describe('viewQuery', () => {
  it('filtra por status, prioridade e assunto (sem acento)', () => {
    const open = applyFilters(tickets, { ...EMPTY_FILTERS, statusIds: ['pending'] });
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((t) => t.statusId === 'pending')).toBe(true);
    const urgent = applyFilters(tickets, { ...EMPTY_FILTERS, priority: 'urgent' });
    expect(urgent.every((t) => t.priority === 'urgent')).toBe(true);
    expect(applyFilters(tickets, { ...EMPTY_FILTERS, subject: 'certificado' }).map((t) => t.subject)).toEqual(['Certificado digital vencido']);
  });

  it('ordena asc/desc e agrupa por categoria antes de ordenar', () => {
    const asc = sortTickets(tickets, { columnId: 'subject', direction: 'asc' }, lk);
    const desc = sortTickets(tickets, { columnId: 'subject', direction: 'desc' }, lk);
    expect(asc[0].subject.localeCompare(asc[1].subject, 'pt-BR')).toBeLessThanOrEqual(0);
    expect(desc.map((t) => t.id)).toEqual([...asc].reverse().map((t) => t.id));
    const grouped = sortTickets(tickets, { columnId: 'id', direction: 'desc' }, lk, true);
    const cats = grouped.map((t) => statuses.find((s) => s.id === t.statusId)!.category);
    expect(cats).toEqual([...cats].sort((a, b) => ['new', 'open', 'pending', 'solved'].indexOf(a) - ['new', 'open', 'pending', 'solved'].indexOf(b)));
  });

  it('gera CSV só com as colunas visíveis, escapando aspas e vírgulas', () => {
    const t = { ...tickets[0], subject: 'Olá, "mundo"' };
    const csv = buildCsv([t], ['id', 'subject', 'priority'], lk);
    const [head, line] = csv.split('\r\n');
    expect(head).toBe('ID,Assunto,Prioridade');
    expect(line.startsWith(`${t.id},"Olá, ""mundo"""`)).toBe(true);
  });
});
