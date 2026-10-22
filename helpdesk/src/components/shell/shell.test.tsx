import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui';
import { useTabs } from '@/store/useTabs';
import { useUi } from '@/store/useUi';
import { GlobalSearch } from './GlobalSearch';
import { NavRail } from './NavRail';
import { SecondaryPanel } from './SecondaryPanel';
import { WorkTabs } from './WorkTabs';
import { openTicket, parseTabRoute, registerNavigate, tabPath } from './openTab';
import { useSearchUi } from './searchState';
import { useGlobalShortcuts } from './shortcuts';
import { useRouteTab } from './useRouteTab';

vi.mock('@/api/search', () => ({
  recentViewed: vi.fn(async () => [{ kind: 'ticket', id: '7', title: 'Fatura duplicada', meta: 'Ticket', at: new Date().toISOString() }]),
  search: vi.fn(async (term: string) => ({
    tickets: [{ id: 12, subject: `Assunto ${term}`, statusId: 'open', channel: 'email' }],
    users: [{ id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.com' }],
    orgs: [],
  })),
  trackViewed: vi.fn(),
}));

function Harness({ children }: { children?: React.ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    registerNavigate((to) => navigate(to));
    return () => registerNavigate(null);
  }, [navigate]);
  useGlobalShortcuts();
  useRouteTab();
  return (
    <TooltipProvider>
      <div data-testid="loc">{loc.pathname + loc.search}</div>
      {children}
    </TooltipProvider>
  );
}

function setup(ui: React.ReactNode, route = '/agent/home') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Harness>{ui}</Harness>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useSearchUi.setState({ open: false });
  useUi.setState({ sidebarCollapsed: false, sidebarWidths: {} });
  registerNavigate(null);
});

const tab = (id: number, dirty = false) => ({ id: `ticket:${id}`, kind: 'ticket' as const, refId: String(id), title: `Ticket ${id}`, dirty });

describe('WorkTabs', () => {
  it('abrir o mesmo ticket duas vezes foca a aba existente', () => {
    setup(<WorkTabs />);
    act(() => {
      openTicket(5, { title: 'Erro no login' });
      openTicket(6, { title: 'Outro' });
      openTicket(5, { title: 'Erro no login' });
    });
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().activeTabId).toBe('ticket:5');
    expect(screen.getByRole('button', { name: /^Erro no login/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/tickets/5');
  });

  it('ativar uma aba navega para a rota dela', async () => {
    useTabs.setState({ tabs: [tab(1), tab(2)], activeTabId: 'ticket:1' });
    setup(<WorkTabs />);
    await userEvent.click(screen.getByRole('button', { name: /^Ticket 2/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/tickets/2');
  });

  it('fechar aba limpa fecha direto; com alterações pede confirmação', async () => {
    useTabs.setState({ tabs: [tab(1), tab(2, true)], activeTabId: 'ticket:1' });
    setup(<WorkTabs />);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aba Ticket 1' }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(['ticket:2']);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar aba Ticket 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Descartar alterações?' });
    expect(useTabs.getState().tabs).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(useTabs.getState().tabs).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar aba Ticket 2' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(useTabs.getState().tabs).toHaveLength(0));
  });

  it('mostra o ponto de alterações não salvas', () => {
    useTabs.setState({ tabs: [tab(3, true)], activeTabId: 'ticket:3' });
    setup(<WorkTabs />);
    expect(screen.getByRole('img', { name: 'Alterações não salvas' })).toBeInTheDocument();
  });
});

describe('rotas e abas', () => {
  it('mapeia rota <-> aba', () => {
    expect(tabPath({ kind: 'user', refId: 'u1' })).toBe('/agent/customers/u1');
    expect(tabPath({ kind: 'search', refId: 'a b' })).toBe('/agent/search?q=a%20b');
    expect(parseTabRoute('/agent/orgs/o1', '')).toMatchObject({ kind: 'org', refId: 'o1' });
    expect(parseTabRoute('/agent/home', '')).toBeNull();
  });

  it('abrir a URL do ticket abre a aba correspondente', () => {
    setup(<WorkTabs />, '/agent/tickets/9');
    expect(useTabs.getState().activeTabId).toBe('ticket:9');
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Abas de trabalho' })).toBeInTheDocument();
  });
});

describe('NavRail', () => {
  it('marca o item ativo conforme a rota', () => {
    setup(<NavRail />, '/agent/views/3');
    expect(screen.getByRole('link', { name: 'Visualizações' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it('recolhe e expande, persistindo em useUi', async () => {
    setup(<NavRail />);
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(useUi.getState().sidebarCollapsed).toBe(true);
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeInTheDocument();
  });
});

describe('SecondaryPanel', () => {
  it('recolhe com ‹ e lembra o estado', async () => {
    setup(
      <SecondaryPanel pageKey="views" width={330} title="Visualizações">
        <p>conteúdo</p>
      </SecondaryPanel>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Recolher Visualizações' }));
    expect(useUi.getState().sidebarWidths.views).toBe(0);
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Visualizações' }));
    expect(useUi.getState().sidebarWidths.views).toBe(330);
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});

describe('atalhos globais', () => {
  it('g h vai para Início e g v para Views', async () => {
    setup(null, '/agent/customers');
    await userEvent.keyboard('gv');
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/views');
    await userEvent.keyboard('gh');
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/home');
  });

  it('/ abre a busca, exceto com foco em campo de texto', async () => {
    setup(<input aria-label="campo" />);
    await userEvent.click(screen.getByLabelText('campo'));
    await userEvent.keyboard('/gh');
    expect(useSearchUi.getState().open).toBe(false);
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/home');
    await userEvent.click(document.body);
    await userEvent.keyboard('/');
    expect(useSearchUi.getState().open).toBe(true);
  });
});

describe('GlobalSearch', () => {
  it('mostra recentes, busca com debounce e Enter abre a aba Pesquisar', async () => {
    setup(
      <>
        <GlobalSearch />
        <WorkTabs />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    expect(await screen.findByText('Fatura duplicada')).toBeInTheDocument();
    for (const c of ['Tickets', 'Artigos', 'Usuários', 'Organizações', 'Conversas paralelas']) {
      expect(screen.getByRole('button', { name: c })).toBeInTheDocument();
    }

    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await userEvent.type(input, 'ana');
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Assunto ana')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(['search:ana']);
    expect(screen.getByRole('button', { name: /^Pesquisar ana/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('loc')).toHaveTextContent('/agent/search?q=ana');
    expect(useSearchUi.getState().open).toBe(false);
  });

  it('Esc fecha', async () => {
    setup(<GlobalSearch />);
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
