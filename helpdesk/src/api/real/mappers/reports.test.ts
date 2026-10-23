import { describe, expect, it } from 'vitest';
import chatMetrics from '../__fixtures__/reports-chat-metrics.json';
import chatReports from '../__fixtures__/reports-chat-reports.json';
import indicators from '../__fixtures__/reports-indicators.json';
import tickets from '../__fixtures__/reports-tickets.json';
import { daysBetween, mapChatReport, mapTicketsReport, rowsToCsv, type ChatMetricsDto, type ChatReportRowDto, type IndicatorsDto, type ReportDto } from './reports';

const filters = { from: '2026-10-14', to: '2026-10-22' };

describe('mapTicketsReport (fixtures reais)', () => {
  const full = mapTicketsReport(tickets as unknown as ReportDto, indicators as unknown as IndicatorsDto, filters);
  it('mapeia linhas, resumo e rótulos', () => {
    expect(full.rows).toHaveLength(3);
    expect(full.rows[0]).toMatchObject({ reference: 'TD-00004', statusLabel: 'Fechado', sourceLabel: 'Formulário web' });
    expect(full.summary.total).toBe(3);
    expect(full.summary.byStatus.map((s) => s.value)).toEqual([1, 1, 1]);
  });
  it('conta equipes e dias a partir das linhas, com dias zerados', () => {
    expect(full.byTeam).toEqual([{ key: 'Suporte', label: 'Suporte', value: 3 }]);
    expect(full.createdByDay.map((d) => d.date)).toEqual(daysBetween('2026-10-14', '2026-10-22'));
    expect(full.createdByDay.reduce((a, d) => a + d.count, 0)).toBe(3);
  });
  it('traz o painel quando há indicadores e nulo quando não há', () => {
    expect(full.panel?.opened.value).toBeTypeOf('number');
    expect(full.panel?.timeline.length).toBeGreaterThan(0);
    expect(mapTicketsReport(tickets as unknown as ReportDto, null, { ...filters, agentId: '3' }).panel).toBeNull();
  });
  it('não inventa SLA: separa no prazo, atrasado e o resto', () => {
    const p = full.panel!;
    expect(p.resolutionSla.onTime + p.resolutionSla.late + p.resolutionSla.other).toBe((indicators as unknown as IndicatorsDto).resolution.reduce((a, i) => a + i.value, 0));
  });
});

describe('mapChatReport', () => {
  const r = mapChatReport(chatMetrics as unknown as ChatMetricsDto, chatReports as unknown as ChatReportRowDto[], { from: '2026-09-23', to: '2026-10-23' });
  it('preenche os dias sem chat com zero e soma o total', () => {
    expect(r.daily).toHaveLength(31);
    expect(r.daily.reduce((a, d) => a + d.count, 0)).toBe(r.metrics.total);
  });
  it('mapeia métricas, agentes e empresas', () => {
    expect(r.metrics.answered).toBe((chatMetrics as unknown as ChatMetricsDto).atendidos);
    expect(r.byAgent[0]!.name).toBeTruthy();
    expect(r.byCompany[0]).toMatchObject({ label: 'Acme Marketing' });
  });
});

describe('rowsToCsv', () => {
  it('usa ; e escapa aspas e quebras', () => {
    const csv = rowsToCsv([{ ...(tickets as unknown as ReportDto).rows[0]!, subject: 'a;"b"' }]);
    const [head, line] = csv.split('\r\n');
    expect(head!.startsWith('reference;subject;company')).toBe(true);
    expect(line).toContain('"a;""b"""');
  });
});
