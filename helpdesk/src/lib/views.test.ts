import { describe, expect, it } from 'vitest';
import { statuses, tickets, views, ME_ID } from '@/mocks';
import { countView, countViews, runView } from './views';

const ctx = { meId: ME_ID, now: new Date(), statuses };
const view = (id: string) => {
  const v = views.find((x) => x.id === id);
  if (!v) throw new Error(id);
  return v;
};

describe('views', () => {
  it('mocks respeitam o brief', () => {
    expect(tickets).toHaveLength(30);
    expect(tickets.filter((t) => !t.assigneeId)).toHaveLength(6);
    expect(tickets.filter((t) => t.sla?.state === 'warning')).toHaveLength(3);
    expect(tickets.filter((t) => t.sla?.state === 'breached')).toHaveLength(2);
  });

  it('não atribuídos', () => {
    expect(countView(view('unassigned'), tickets, ctx)).toBe(6);
  });

  it('seus tickets sem resolução', () => {
    const r = runView(view('mine'), tickets, ctx);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((t) => t.assigneeId === ME_ID && t.statusId !== 'solved')).toBe(true);
  });

  it('sem resolução exclui só a categoria solved', () => {
    const solved = tickets.filter((t) => t.statusId === 'solved').length;
    expect(countView(view('all-unsolved'), tickets, ctx)).toBe(30 - solved);
    expect(countView(view('solved-recent'), tickets, ctx)).toBe(solved - 1); // #30 foi resolvido há mais de 7 dias
  });

  it('countViews usa a mesma função e chaveia por countKey', () => {
    const counts = countViews(views, tickets, ctx);
    for (const v of views) expect(counts[v.countKey]).toBe(runView(v, tickets, ctx).length);
  });
});
