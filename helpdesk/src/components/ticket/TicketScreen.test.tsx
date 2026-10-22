import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { TooltipProvider } from '@/components/ui';
import TicketPage from '@/pages/Ticket';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useFormStore } from './formStore';
import { resetTicketLookups } from './useTicketLookups';

function renderAt(path: string) {
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
});

describe('Tela do ticket', () => {
  it('carrega o ticket, mostra propriedades e o badge reflete o status do formulário', async () => {
    await useTickets.getState().load();
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId === 'open')!;
    renderAt(`/agent/tickets/${t.id}`);
    expect(await screen.findByRole('complementary', { name: 'Propriedades do ticket' })).toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: new RegExp(`#${t.id}`) });
    expect(within(tab).getByRole('img', { name: 'Aberto' })).toBeInTheDocument();
    useFormStore.getState().patch(`ticket:${t.id}`, { statusId: 'pending', type: 'question' });
    await waitFor(() => {
      expect(within(screen.getByRole('tab', { name: new RegExp(`Pergunta #${t.id}`) })).getByRole('img', { name: 'Pendente' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'aceitar' })).toBeNull(); // já é meu
  });

  it('"aceitar" atribui a mim, só no formulário (pendente)', async () => {
    await useTickets.getState().load();
    const t = useTickets.getState().tickets.find((x) => !x.assigneeId)!;
    renderAt(`/agent/tickets/${t.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'aceitar' }));
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.assigneeId).toBe('me');
    expect(useFormStore.getState().isDirty(`ticket:${t.id}`)).toBe(true);
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.assigneeId).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'aceitar' })).toBeNull();
  });

  it('seletor de atribuído em 2 níveis', async () => {
    await useTickets.getState().load();
    const t = useTickets.getState().tickets.find((x) => !x.assigneeId)!;
    renderAt(`/agent/tickets/${t.id}`);
    await userEvent.click(await screen.findByRole('combobox', { name: /atribuído/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Suporte N2/ }));
    expect(screen.getByRole('menuitem', { name: /Grupos/ })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: /Bruno Carvalho/ }));
    const v = useFormStore.getState().forms[`ticket:${t.id}`]!.values;
    expect([v.assigneeGroupId, v.assigneeId]).toEqual(['g2', 'a4']);
  });

  it('mostra 404 quando o ticket não existe', async () => {
    renderAt('/agent/tickets/9999');
    expect(await screen.findByText('Ticket não encontrado')).toBeInTheDocument();
  });

  it('ticket fora da lista carregada (paginação): busca por id em vez de dizer "não encontrado"', async () => {
    await useTickets.getState().load();
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId === 'open')!;
    // Simula a store só com a 1ª página: o ticket existe no servidor mas não está na lista.
    useTickets.setState((st) => ({ tickets: st.tickets.filter((x) => x.id !== t.id) }));
    renderAt(`/agent/tickets/${t.id}`);
    expect(await screen.findByRole('complementary', { name: 'Propriedades do ticket' })).toBeInTheDocument();
    expect(screen.queryByText('Ticket não encontrado')).toBeNull();
  });

  it('mostra erro de carregamento com Tentar novamente', async () => {
    configureApi({ failRate: 1 });
    // listTickets é crítico? o load usa simulate sem critical para listTickets/listStatuses => falha
    renderAt('/agent/tickets/1');
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('novo ticket: foca o solicitante, sem sub-abas Cliente até escolher, e assunto em destaque', async () => {
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
    renderAt('/agent/tickets/new');
    const subject = await screen.findByRole('textbox', { name: 'Assunto' });
    expect(subject).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Cliente' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /solicitante/i })).toHaveFocus());
    await userEvent.type(subject, 'Meu assunto');
    expect(useFormStore.getState().forms['new-ticket:1']!.values.subject).toBe('Meu assunto');
    expect(useTabs.getState().tabs[0]!.dirty).toBe(true);
    useFormStore.getState().patch('new-ticket:1', { requesterId: 'u1' });
    expect(await screen.findByRole('tab', { name: 'Cliente' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Lojas Horizonte/ })).toBeInTheDocument();
  });
});
