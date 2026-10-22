import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/api/db';
import { configureApi } from '@/api/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { RightRail } from '@/components/shell/RightRail';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useFormStore } from './formStore';
import { useRightPanel } from './panels/panelState';
import { resetTicketLookups } from './useTicketLookups';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <div className="flex">
          <div className="flex-1">
            <Routes>
              <Route path="/agent/tickets/new" element={<TicketPage />} />
              <Route path="/agent/tickets/:id" element={<TicketPage />} />
            </Routes>
          </div>
          <RightRail />
        </div>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetDb();
  resetDirectoryCache();
  resetTicketLookups();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useRightPanel.setState({ open: null });
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
});


const realMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

async function openMine() {
  await useTickets.getState().load();
  const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId === 'open')!;
  renderAt(`/agent/tickets/${t.id}`);
  await screen.findByRole('button', { name: /Enviar como Aberto/ });
  return t;
}

describe('tela do ticket abaixo de 1024 px', () => {
  it('o painel direito abre como Drawer e Esc fecha', async () => {
    await openMine();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Conhecimento' }));
    expect(await screen.findByRole('dialog', { name: 'Conhecimento' })).toBeInTheDocument();
    // O foco cai num botão com tooltip: o 1º Esc fecha o tooltip, o 2º fecha o Drawer.
    await userEvent.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useRightPanel.getState().open).toBeNull();
  });

  it('as propriedades viram acordeão: só o primeiro grupo abre', async () => {
    await openMine();
    const first = screen.getByRole('button', { name: 'Solicitante e atribuição' });
    const second = screen.getByRole('button', { name: 'Classificação' });
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });
});
