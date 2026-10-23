import { beforeEach, describe, expect, it } from 'vitest';
import { filtersFor, resetReports, useReports } from './reports';

beforeEach(() => resetReports());

describe('store de relatórios (mock)', () => {
  it('carrega tickets uma vez por filtro e recarrega ao mudar o período', async () => {
    await useReports.getState().ensure('tickets');
    const first = useReports.getState().tickets;
    expect(first.data?.rows.length).toBeGreaterThan(0);
    expect(first.updatedAt).toBeTypeOf('number');
    await useReports.getState().ensure('tickets');
    expect(useReports.getState().tickets.data).toBe(first.data);
    useReports.getState().setPreset('today');
    await useReports.getState().ensure('tickets');
    expect(useReports.getState().tickets.data).not.toBe(first.data);
  });
  it('cartões, gráficos e tabela saem da mesma fonte', async () => {
    await useReports.getState().ensure('tickets');
    const r = useReports.getState().tickets.data!;
    expect(r.panel!.opened.value).toBe(r.rows.length);
    expect(r.summary.total).toBe(r.rows.length);
    expect(r.summary.byStatus.reduce((a, s) => a + s.value, 0)).toBe(r.rows.length);
    expect(r.byTeam.reduce((a, s) => a + s.value, 0)).toBe(r.rows.length);
    expect(r.panel!.timeline.reduce((a, d) => a + d.opened, 0)).toBe(r.rows.length);
    expect(r.panel!.byPriority.reduce((a, s) => a + s.value, 0)).toBe(r.rows.length);
  });
  it('responsável tira o painel; o chat só usa período e responsável', () => {
    useReports.getState().setFilter('teamId', 'g1');
    useReports.getState().setFilter('agentId', 'a2');
    const s = useReports.getState();
    expect(filtersFor(s, 'chat')).toEqual({ from: s.from, to: s.to, agentId: 'a2' });
    expect(filtersFor(s, 'tickets').teamId).toBe('g1');
  });
  it('intervalo inválido vira erro sem chamar a API', async () => {
    useReports.getState().setCustomRange('2026-10-20', '2026-10-01');
    await useReports.getState().refresh('tickets');
    expect(useReports.getState().tickets.error).toMatch(/data inicial/i);
    useReports.getState().setCustomRange('2024-01-01', '2026-10-01');
    await useReports.getState().refresh('chat');
    expect(useReports.getState().chat.error).toMatch(/366/);
  });
  it('chat carrega no mock', async () => {
    await useReports.getState().ensure('chat');
    const c = useReports.getState().chat.data!;
    expect(c.daily.reduce((a, d) => a + d.count, 0)).toBe(c.metrics.total);
    expect(c.byAgent.reduce((a, d) => a + d.total, 0)).toBe(c.metrics.answered);
  });
});
