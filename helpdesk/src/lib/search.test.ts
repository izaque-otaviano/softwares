import { describe, expect, it } from 'vitest';
import { orgs, tickets, users } from '@/api/mock/data';
import { normalize, searchAll } from './search';

const data = { tickets, users, orgs };

describe('searchAll', () => {
  it('ignora acento e caixa', () => {
    expect(normalize('Patrícia')).toBe('patricia');
    expect(searchAll('PATRICIA', data).users.map((u) => u.name)).toContain('Patrícia Gomes');
  });
  it('busca por assunto', () => {
    expect(searchAll('nota fiscal', data).tickets.some((t) => t.id === 1)).toBe(true);
  });
  it('busca por #id', () => {
    expect(searchAll('#3', data).tickets.map((t) => t.id)).toContain(3);
    expect(searchAll('#3', data).users).toHaveLength(0);
  });
  it('busca por e-mail parcial do solicitante e agrupa por tipo', () => {
    const r = searchAll('horizonte', data);
    expect(r.orgs.map((o) => o.name)).toContain('Lojas Horizonte');
    expect(r.users.length).toBeGreaterThanOrEqual(3);
    expect(r.tickets.length).toBeGreaterThan(0);
  });
  it('vazio devolve grupos vazios', () => {
    expect(searchAll('  ', data)).toEqual({ tickets: [], users: [], orgs: [] });
  });
});

describe('operadores', () => {
  const withStatuses = { ...data, statuses: [] };
  it('status:aberto devolve tickets na categoria aberto', () => {
    const r = searchAll('status:aberto', withStatuses);
    expect(r.tickets.length).toBeGreaterThan(0);
    expect(r.users).toHaveLength(0);
  });
  it('combina operadores com texto livre', () => {
    const all = searchAll('status:aberto assignee:me', withStatuses).tickets;
    expect(all.every((t) => t.assigneeId === 'me')).toBe(true);
    expect(searchAll('status:pendente', withStatuses).tickets.every((t) => t.statusId === 'pending')).toBe(true);
    expect(searchAll('priority:alta', withStatuses).tickets.every((t) => t.priority === 'high')).toBe(true);
    expect(searchAll('status:aberto nota fiscal', withStatuses).tickets.every((t) => ['open', 'in_progress'].includes(t.statusId))).toBe(true);
  });
});
