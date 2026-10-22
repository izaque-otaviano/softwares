import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { useTickets } from '@/store/useTickets';
import Home from './Home';

const openTicket = vi.fn();
const openSearch = vi.fn();
vi.mock('@/components/shell/openTab', () => ({ openTicket: (...a: unknown[]) => openTicket(...a), openSearch: (...a: unknown[]) => openSearch(...a) }));

beforeEach(() => {
  resetDb();
  resetDirectoryCache();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useTickets.setState({ tickets: [], statuses: [], loaded: false, loading: false, error: null });
  openTicket.mockClear();
  openSearch.mockClear();
});

describe('Home', () => {
  it('lista os tickets atribuídos, abre o ticket e leva o número à busca', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('status', { name: 'Carregando tickets' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Lista de tickets' });
    const items = within(list).getAllByRole('listitem');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${items.length} tickets`);
    expect(screen.getByText('Sem atualizações recentes.')).toBeInTheDocument();
    await user.click(within(items[0]).getByRole('button'));
    expect(openTicket).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /tickets abertos/ }));
    expect(openSearch).toHaveBeenCalled();
  });

  it('erro mostra Banner com Tentar novamente', async () => {
    configureApi({ failRate: 1 });
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });
});
