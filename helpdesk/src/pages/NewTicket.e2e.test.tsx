import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '@/api/db';
import { configureApi } from '@/api/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { useRightPanel } from '@/components/ticket/panels/panelState';
import { useFormStore } from '@/components/ticket/formStore';
import { resetTicketLookups } from '@/components/ticket/useTicketLookups';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';

function renderNew(path = '/agent/tickets/new?requester=u1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/agent/tickets/new" element={<TicketPage />} />
          <Route path="/agent/tickets/:id" element={<TicketPage />} />
        </Routes>
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
  useTickets.setState({ loaded: false, loading: false, error: null, tickets: [], counts: {} });
  useRightPanel.setState({ open: null });
  useUi.setState({ toasts: [] });
  useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
});

async function createTicket(mode: 'internal' | 'public') {
  const user = userEvent.setup();
  renderNew();
  // ?requester=u1 pré-seleciona o solicitante: sub-abas e cartão do cliente com histórico.
  expect(await screen.findByRole('tab', { name: 'Cliente' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Lojas Horizonte/ })).toBeInTheDocument();
  expect(await screen.findByRole('region', { name: 'Histórico de interações' })).toBeInTheDocument();
  expect(useFormStore.getState().forms['new-ticket:1']!.values.requesterId).toBe('u1');

  await user.type(screen.getByRole('textbox', { name: 'Assunto' }), `Teste ${mode}`);
  const composer = screen.getByTestId('composer');
  if (mode === 'internal') {
    await user.click(within(composer).getByRole('button', { name: /Modo de resposta/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Observação interna/ }));
  }
  // ProseMirror não digita em jsdom (sem getClientRects): o editor avisa o formStore exatamente assim (onUpdate -> setBody).
  expect(within(composer).getByRole('textbox', { name: 'Mensagem' })).toBeInTheDocument();
  act(() => useFormStore.getState().setBody('new-ticket:1', '<p>Texto do primeiro contato</p>'));
  await waitFor(() => expect(useFormStore.getState().forms['new-ticket:1']!.bodyHtml).toContain('Texto do primeiro contato'));

  await user.click(screen.getByRole('button', { name: /Enviar como Novo|Enviar como Aberto/ }));
  await waitFor(() => expect(useUi.getState().toasts.some((t) => /^Ticket #\d+ foi criado$/.test(t.title))).toBe(true));
  const id = Number(/#(\d+)/.exec(useUi.getState().toasts.at(-1)!.title)![1]);

  // A MESMA aba virou o ticket criado.
  const { tabs, activeTabId } = useTabs.getState();
  expect(tabs).toHaveLength(1);
  expect(tabs[0]).toMatchObject({ id: `ticket:${id}`, kind: 'ticket', refId: String(id) });
  expect(activeTabId).toBe(`ticket:${id}`);
  return db.tickets.find((t) => t.id === id)!;
}

const triggerEvents = (t: { events: { kind: string; text: string }[] }) => t.events.filter((e) => e.kind === 'notification' && e.text.includes('Gatilho'));

describe('Novo ticket (e2e)', () => {
  it('com observação interna NÃO gera notificação de gatilho', async () => {
    const t = await createTicket('internal');
    expect(t.comments[0]!.public).toBe(false);
    expect(triggerEvents(t)).toHaveLength(0);
  });

  it('com resposta pública gera a notificação do gatilho', async () => {
    const t = await createTicket('public');
    expect(t.comments[0]!.public).toBe(true);
    expect(triggerEvents(t).length).toBeGreaterThan(0);
  });

  it('foca o solicitante ao abrir (sem ?requester)', async () => {
    renderNew('/agent/tickets/new');
    await waitFor(() => expect(screen.getByRole('combobox', { name: /solicitante/i })).toHaveFocus());
    expect(screen.queryByRole('tab', { name: 'Cliente' })).toBeNull();
  });
});
