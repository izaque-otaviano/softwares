import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { resetTicketLookups } from '@/components/ticket/useTicketLookups';
import { TooltipProvider } from '@/components/ui';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import Search from './Search';

const openTicket = vi.fn();
vi.mock('@/components/shell/openTab', async (orig) => ({ ...(await orig<typeof import('@/components/shell/openTab')>()), openTicket: (...a: unknown[]) => openTicket(...a) }));

function Where() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/agent/search" element={<Search />} />
        </Routes>
        <Where />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetDb();
  resetDirectoryCache();
  resetTicketLookups();
  openTicket.mockClear();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
});

describe('Página de busca', () => {
  it('status:aberto lista tickets, contadores no painel e clique abre o ticket', async () => {
    renderAt('/agent/search?q=status%3Aaberto');
    const table = await screen.findByRole('table', { name: 'Tickets encontrados' });
    await within(table).findAllByText(/^#\d+$/);
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: /Tickets/ })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pesquisa salva')).toBeInTheDocument();
    await userEvent.click(rows[1]!);
    expect(openTicket).toHaveBeenCalled();
  });

  it('editar o termo atualiza a URL e o título da aba', async () => {
    useTabs.getState().openTab({ kind: 'search', refId: 'nota', title: 'Pesquisar nota' });
    renderAt('/agent/search?q=nota');
    const input = await screen.findByRole('textbox', { name: 'Termo da pesquisa' });
    await userEvent.clear(input);
    await userEvent.type(input, 'horizonte{Enter}');
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/agent/search?q=horizonte'));
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]!.title).toBe('Pesquisar horizonte');
  });

  it('usuários e artigos', async () => {
    renderAt('/agent/search?q=horizonte');
    await userEvent.click(await screen.findByRole('button', { name: /Usuários/ }));
    expect(await screen.findByRole('table', { name: 'Usuários encontrados' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Artigos/ }));
    expect(screen.getByText('Nenhum artigo nesta versão')).toBeInTheDocument();
  });

  it('erro de API mostra Tentar novamente', async () => {
    configureApi({ failRate: 1 });
    renderAt('/agent/search?q=nota');
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
