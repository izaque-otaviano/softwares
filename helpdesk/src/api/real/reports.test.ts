import { afterEach, describe, expect, it, vi } from 'vitest';
import indicators from './__fixtures__/reports-indicators.json';
import chatMetrics from './__fixtures__/reports-chat-metrics.json';
import chatReports from './__fixtures__/reports-chat-reports.json';
import tickets from './__fixtures__/reports-tickets.json';
import { ApiError } from '../errors';
import { exportTicketsCsv, getChatReport, getTicketsReport } from './reports';

const filters = { from: '2026-10-14', to: '2026-10-22' };
let urls: string[] = [];

function stub(handler: (path: string) => { status?: number; body: unknown; headers?: Record<string, string>; text?: string }) {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = handler(url);
      return new Response(r.text ?? JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('api real de relatórios', () => {
  it('tickets: chama relatório e painel com os filtros aceitos', async () => {
    stub((u) => ({ body: u.includes('/indicators/') ? indicators : tickets }));
    const r = await getTicketsReport({ ...filters, teamId: '2' });
    expect(r.panel).not.toBeNull();
    expect(urls.find((u) => u.includes('/reports/tickets/'))).toContain('team=2');
    expect(urls.find((u) => u.includes('/indicators/'))).toContain('from=2026-10-14');
  });
  it('tickets: com responsável ou empresa não chama o painel', async () => {
    stub(() => ({ body: tickets }));
    const r = await getTicketsReport({ ...filters, agentId: '3', companyId: '1' });
    expect(r.panel).toBeNull();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('agent=3');
    expect(urls[0]).toContain('company=1');
  });
  it('tickets: 400, 403 e 404 viram ApiError em pt-BR', async () => {
    stub(() => ({ status: 400, body: { from: 'Data inválida (use AAAA-MM-DD).' } }));
    await expect(getTicketsReport(filters)).rejects.toMatchObject({ status: 400, message: 'Data inválida (use AAAA-MM-DD).' });
    stub(() => ({ status: 403, body: { detail: 'Relatórios são área interna.' } }));
    await expect(getTicketsReport(filters)).rejects.toMatchObject({ status: 403 });
    stub(() => ({ status: 404, body: {} }));
    await expect(getTicketsReport(filters)).rejects.toBeInstanceOf(ApiError);
  });
  it('chat: usa desde/ate/agent e o histórico por empresa', async () => {
    stub((u) => ({ body: u.includes('/metrics/') ? chatMetrics : chatReports }));
    const r = await getChatReport({ from: '2026-09-23', to: '2026-10-23', agentId: '3' });
    expect(urls.find((u) => u.includes('/metrics/'))).toMatch(/desde=2026-09-23&ate=2026-10-23&agent=3/);
    expect(urls.find((u) => u.includes('/chat/reports/'))).toContain('by=company');
    expect(r.byCompany.length).toBeGreaterThan(0);
  });
  it('exportação: devolve o CSV e o nome do Content-Disposition', async () => {
    stub(() => ({ text: 'reference;subject\r\nTD-1;a\r\n', body: null, headers: { 'Content-Disposition': 'attachment; filename="resolv-tickets-2026-10-23.csv"' } }));
    const file = await exportTicketsCsv({ ...filters, teamId: '2' });
    expect(file).toEqual({ filename: 'resolv-tickets-2026-10-23.csv', csv: 'reference;subject\r\nTD-1;a\r\n' });
    // o backend responde 406 a `Accept: text/csv`; o cabeçalho precisa ser aceito por qualquer tipo
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ headers: { Accept: '*/*' } });
    expect(urls[0]).toContain('/reports/tickets/export/?from=2026-10-14&to=2026-10-22&team=2');
  });
  it('exportação: 403 e 400 dão mensagem clara', async () => {
    stub(() => ({ status: 403, body: { detail: 'Relatórios são área interna.' } }));
    await expect(exportTicketsCsv(filters)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('permissão') });
    stub(() => ({ status: 400, body: { detail: 'Data inválida.' } }));
    await expect(exportTicketsCsv(filters)).rejects.toMatchObject({ status: 400, message: 'Data inválida.' });
  });
});
