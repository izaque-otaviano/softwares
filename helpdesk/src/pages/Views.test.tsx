import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { useViewPrefs } from '@/components/lists/useViewPrefs';
import { usePlayQueue } from '@/components/lists/usePlayQueue';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { views as seedViews } from '@/mocks';
import Views from './Views';

const openTicket = vi.fn();
vi.mock('@/components/shell/openTab', () => ({ openTicket: (...a: unknown[]) => openTicket(...a), openSearch: vi.fn() }));

function renderViews(id = 'all-unsolved') {
  return render(
    <MemoryRouter initialEntries={[`/agent/views/${id}`]}>
      <Routes>
        <Route path="/agent/views/:id" element={<Views />} />
      </Routes>
    </MemoryRouter>,
  );
}

const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).filter((r) => r.querySelector('input[type="checkbox"]'));

beforeEach(() => {
  resetDb();
  resetDirectoryCache();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useViewPrefs.getState().reset();
  usePlayQueue.getState().stop();
  useUi.setState({ tableColumns: {}, toasts: [] });
  useTickets.setState({ tickets: [], statuses: [], views: seedViews, counts: Object.fromEntries(seedViews.map((v) => [v.countKey, null])), loaded: false, loading: false, error: null });
  openTicket.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Views', () => {
  it('mostra contadores "-" e depois os números; lista agrupada por categoria', async () => {
    renderViews();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    await screen.findByText(/Categoria do status: Aberto/);
    expect(screen.getByText(/Categoria do status: Pendente/)).toBeInTheDocument();
    const count = useTickets.getState().counts['all-unsolved'];
    expect(screen.getByText(new RegExp(`^${count} tickets · Última atualização agora mesmo`))).toBeInTheDocument();
  });

  it('ordena por assunto (asc depois desc) e abre o ticket ao clicar na linha', async () => {
    const user = userEvent.setup();
    renderViews('unassigned');
    await screen.findAllByRole('checkbox', { name: /Ticket #/ });
    const subjects = () => dataRows().map((r) => r.querySelectorAll('td')[2]?.textContent ?? '');
    await user.click(within(screen.getByRole('columnheader', { name: /Assunto/ })).getByRole('button'));
    const asc = subjects();
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    await user.click(within(screen.getByRole('columnheader', { name: /Assunto/ })).getByRole('button'));
    expect(subjects()).toEqual([...asc].reverse());
    await user.click(dataRows()[0].querySelectorAll('td')[2]!);
    expect(openTicket).toHaveBeenCalledTimes(1);
  });

  it('filtra pelo drawer e persiste o filtro ao trocar de view', async () => {
    const user = userEvent.setup();
    renderViews('all-unsolved');
    await screen.findAllByRole('checkbox', { name: /Ticket #/ });
    const before = dataRows().length;
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    const dlg = await screen.findByRole('dialog', { name: 'Filtrar tickets' });
    await user.click(within(dlg).getByRole('checkbox', { name: 'Pendente' }));
    await user.click(within(dlg).getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(dataRows().length).toBeLessThan(before));
    expect(dataRows().length).toBe(useTickets.getState().tickets.filter((t) => t.statusId === 'pending').length);
    expect(useViewPrefs.getState().filters['all-unsolved']?.statusIds).toEqual(['pending']);
    expect(screen.getByRole('button', { name: 'Filtrar (1)' })).toBeInTheDocument();
  });

  it('gera o CSV com os dados filtrados e as colunas visíveis', async () => {
    const user = userEvent.setup();
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => ((blob = b), 'blob:x'));
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderViews('pending');
    await screen.findAllByRole('checkbox', { name: /Ticket #/ });
    await user.click(screen.getByRole('button', { name: /Ações/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Exportar como CSV' }));
    expect(blob).toBeDefined();
    const text = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsText(blob!);
    });
    const lines = text.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Status do ticket,Assunto,Solicitante,Data da solicitação,Tipo,Prioridade');
    expect(lines).toHaveLength(1 + useTickets.getState().ticketsForView('pending').length);
    expect(lines[1]).toContain('Pendente');
  });

  it('ações em lote: atribuir a mim e apagar com confirmação', async () => {
    const user = userEvent.setup();
    renderViews('unassigned');
    await screen.findAllByRole('checkbox', { name: /Ticket #/ });
    const n = dataRows().length;
    const boxes = screen.getAllByRole('checkbox', { name: /Ticket #/ });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    expect(screen.getByText('2 tickets selecionados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atribuir a mim' }));
    await waitFor(() => expect(dataRows().length).toBe(n - 2));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('checkbox', { name: /Ticket #/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Apagar' }));
    const confirm = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await user.click(within(confirm).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(dataRows().length).toBe(n - 3));
  });

  it('estado vazio mantém o cabeçalho e some o Play', async () => {
    useTickets.setState({ loaded: false });
    const { db } = await import('@/api');
    db.tickets = [];
    renderViews('pending');
    expect(await screen.findByText('Nenhum ticket nesta visualização')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Tickets pendentes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play/ })).not.toBeInTheDocument();
  });

  it('erro de API mostra "Tentar novamente" e recupera', async () => {
    const user = userEvent.setup();
    configureApi({ failRate: 1 });
    renderViews();
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    configureApi({ failRate: 0 });
    await user.click(retry);
    await screen.findByText(/Categoria do status: Aberto/);
  });

  it('Play abre o primeiro ticket e o ColumnsDrawer reordena por botões', async () => {
    const user = userEvent.setup();
    renderViews('all-unsolved');
    await screen.findAllByRole('checkbox', { name: /Ticket #/ });
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const dlg = await screen.findByRole('dialog', { name: 'Gerenciar colunas' });
    expect(within(dlg).getByText('4 de 10 colunas restantes')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Mover Assunto para cima' }));
    await user.click(within(dlg).getByRole('button', { name: 'Remover coluna Tipo' }));
    await user.click(within(dlg).getByRole('button', { name: 'Aplicar' }));
    expect(useViewPrefs.getState().columns['all-unsolved']).toEqual(['subject', 'status', 'requester', 'createdAt', 'priority']);
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(openTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Reproduzindo: ticket 1 de/)).toBeInTheDocument();
  });
});
