import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api/reports';
import { ApiError } from '@/api/errors';
import { resetReports, useReports } from '@/store/reports';
import Reports from './Reports';

beforeEach(() => resetReports());

describe('Relatórios', () => {
  it('mostra abas, cartões e gráficos com descrição e papel img', async () => {
    render(<Reports />);
    expect(screen.getByRole('tab', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    const kpis = await screen.findByRole('list', { name: /Indicadores de tickets/ }).catch(() => null);
    expect(kpis ?? (await screen.findByLabelText('Indicadores de tickets'))).toBeTruthy();
    expect(await screen.findByText('Tickets abertos')).toBeInTheDocument();
    expect(screen.getAllByRole('img').some((i) => /Abertos e resolvidos por dia/.test(i.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getByRole('table', { name: 'Tickets do período' })).toBeInTheDocument();
  });

  it('"Ver como tabela" troca o gráfico pela mesma série em tabela', async () => {
    render(<Reports />);
    await screen.findByText('Tickets abertos');
    const card = screen.getByRole('region', { name: 'Tickets por status' });
    await userEvent.click(within(card).getByRole('button', { name: 'Ver como tabela' }));
    const table = within(card).getByRole('table', { name: /Tickets por status, em tabela/ });
    expect(within(table).getByText('Novo')).toBeInTheDocument();
    expect(within(card).queryByRole('img')).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Ver gráfico' }));
    expect(within(card).getByRole('img')).toBeInTheDocument();
  });

  it('atalhos de período mudam o filtro e a aba Chat só tem período e responsável', async () => {
    render(<Reports />);
    await screen.findByText('Tickets abertos');
    await userEvent.click(screen.getByRole('button', { name: '7 dias' }));
    expect(useReports.getState().preset).toBe('7d');
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(await screen.findByText('Chats encerrados')).toBeInTheDocument();
    const form = screen.getByRole('search', { name: 'Filtros do relatório' });
    expect(within(form).queryByLabelText('Equipe')).toBeNull();
    expect(within(form).queryByLabelText('Empresa')).toBeNull();
    expect(within(form).getByLabelText('Responsável')).toBeInTheDocument();
  });

  it('erro mostra "Tentar novamente" e recupera', async () => {
    const spy = vi.spyOn(api, 'getTicketsReport').mockRejectedValueOnce(new ApiError('Erro no servidor. Tente novamente em instantes.', { status: 500 }));
    render(<Reports />);
    expect(await screen.findByText('Erro no servidor. Tente novamente em instantes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Tickets abertos')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('período sem dados explica o que fazer', async () => {
    render(<Reports />);
    await screen.findByText('Tickets abertos');
    useReports.getState().setCustomRange('2020-01-01', '2020-01-02');
    expect((await screen.findAllByText('Sem tickets neste período')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Amplie o período/).length).toBeGreaterThan(0);
  });

  it('exporta CSV de verdade no mock (download com o filtro atual)', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    render(<Reports />);
    await screen.findByText('Tickets abertos');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(created.length).toBe(1));
    const text = await created[0]!.text();
    expect(text).toContain('reference;subject;company');
  });
});
