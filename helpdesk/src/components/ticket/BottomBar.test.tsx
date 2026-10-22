import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
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

async function openMine() {
  await useTickets.getState().load();
  const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId === 'open')!;
  renderAt(`/agent/tickets/${t.id}`);
  await screen.findByRole('button', { name: /Enviar como Aberto/ });
  return t;
}

describe('BottomBar: macros', () => {
  it('aplicar macro muda status, botão e texto sem enviar', async () => {
    const t = await openMine();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar macro' }));
    expect(await screen.findByText('Criar uma macro')).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Cliente não responde'));
    expect(await screen.findByRole('button', { name: /Enviar como Pendente/ })).toBeInTheDocument();
    const form = useFormStore.getState().forms[`ticket:${t.id}`]!;
    expect(form.values.statusId).toBe('pending');
    expect(form.bodyHtml).not.toBe('');
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe('open');
  });

  it('pré-visualização: Cancelar não altera nada; Aplicar altera só o formulário', async () => {
    const t = await openMine();
    const key = `ticket:${t.id}`;
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar macro' }));
    await userEvent.click(await screen.findByTitle('Pré-visualizar Cliente não responde'));
    const dialog = await screen.findByRole('dialog', { name: 'Cliente não responde' });
    expect(await within(dialog).findByText(/Categoria do status: Pendente/)).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Resposta pública' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useFormStore.getState().forms[key]!.values.statusId).toBe('open');
    expect(useFormStore.getState().forms[key]!.bodyHtml).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Aplicar macro' }));
    await userEvent.click(await screen.findByTitle('Pré-visualizar Cliente não responde'));
    const d2 = await screen.findByRole('dialog', { name: 'Cliente não responde' });
    await userEvent.click(await within(d2).findByRole('button', { name: 'Aplicar macro' }));
    expect(useFormStore.getState().forms[key]!.values.statusId).toBe('pending');
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe('open');
  });
});

describe('BottomBar: atalhos', () => {
  it('Shift+Enter na lista de macros abre a pré-visualização sem aplicar', async () => {
    const t = await openMine();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar macro' }));
    const input = await screen.findByPlaceholderText('Pesquisar macros');
    await screen.findByText('Cliente não responde');
    await userEvent.type(input, 'Cliente não');
    await waitFor(() => expect(screen.getByText('Shift + Enter para abrir a visualização')).toBeInTheDocument());
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(await screen.findByRole('dialog', { name: 'Cliente não responde' })).toBeInTheDocument();
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.values.statusId).toBe('open');
  });

  it('Ctrl+Enter envia o ticket (mesmo com o foco dentro do formulário)', async () => {
    const t = await openMine();
    const key = `ticket:${t.id}`;
    useFormStore.getState().patch(key, { priority: 'urgent' });
    screen.getByRole('button', { name: 'Aplicar macro' }).focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.priority).toBe('urgent'));
  });

  it('Cmd+Enter também envia', async () => {
    const t = await openMine();
    useFormStore.getState().patch(`ticket:${t.id}`, { priority: 'low' });
    screen.getByRole('button', { name: 'Aplicar macro' }).focus();
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.priority).toBe('low'));
  });
});

describe('BottomBar: envio', () => {
  it('escolher "Resolvido" no menu envia na hora e atualiza os contadores', async () => {
    const t = await openMine();
    const before = { ...useTickets.getState().counts };
    expect(useTickets.getState().ticketsForView('mine').some((x) => x.id === t.id)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Escolher status de envio' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Resolvido' }));
    await waitFor(() => expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe('solved'));
    expect(useTickets.getState().ticketsForView('mine').some((x) => x.id === t.id)).toBe(false);
    expect(useTickets.getState().ticketsForView('solved-recent').some((x) => x.id === t.id)).toBe(true);
    const after = useTickets.getState().counts;
    expect(after.mine).toBe((before.mine ?? 0) - 1);
    expect(after['solved-recent']).toBe((before['solved-recent'] ?? 0) + 1);
  });

  it('ticket existente não oferece "Novo"; ticket novo oferece', async () => {
    await openMine();
    await userEvent.click(screen.getByRole('button', { name: 'Escolher status de envio' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Aberto', 'Em andamento', 'Pendente', 'Resolvido']);
  });

  it('ticket novo lista Novo, Aberto, Em andamento, Pendente, Resolvido', async () => {
    await useTickets.getState().load();
    useTabs.getState().openTab({ kind: 'new-ticket', title: 'Novo ticket' });
    renderAt('/agent/tickets/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Escolher status de envio' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Novo', 'Aberto', 'Em andamento', 'Pendente', 'Resolvido']);
  });

  it('Permanecer no ticket / Fechar aba grava no formulário', async () => {
    const t = await openMine();
    await userEvent.click(screen.getByRole('button', { name: /Permanecer no ticket/ }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Fechar aba' }));
    expect(useFormStore.getState().forms[`ticket:${t.id}`]!.stayOnTicket).toBe(false);
  });
});

describe('RightRail', () => {
  it('um painel por vez; clicar de novo fecha; badge de fusão', async () => {
    await useTickets.getState().load();
    const key = (() => {
      const byReq = new Map<string, number>();
      for (const t of useTickets.getState().tickets) {
        const solved = useTickets.getState().statuses.find((s) => s.id === t.statusId)?.category === 'solved';
        if (!solved) byReq.set(t.requesterId, (byReq.get(t.requesterId) ?? 0) + 1);
      }
      return [...byReq.entries()].find(([, n]) => n >= 2)!;
    })();
    const t = useTickets.getState().tickets.find((x) => x.requesterId === key[0] && x.statusId !== 'solved')!;
    renderAt(`/agent/tickets/${t.id}`);
    const badge = await screen.findByTestId('merge-badge');
    expect(badge).toHaveTextContent(String(key[1] - 1));

    expect(screen.queryByRole('region', { name: 'Cliente' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cliente' }));
    const panel = await screen.findByRole('region', { name: 'Cliente' });
    expect(within(panel).getByRole('heading', { name: 'Histórico de interações' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tarefas' }));
    expect(screen.queryByRole('region', { name: 'Cliente' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Tarefas' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tarefas' }));
    expect(screen.queryByRole('region', { name: 'Tarefas' })).toBeNull();
  });

  it('fundir: marca, confirma e chama mergeTickets', async () => {
    await useTickets.getState().load();
    const counts = new Map<string, number>();
    for (const t of useTickets.getState().tickets) {
      if (useTickets.getState().statuses.find((s) => s.id === t.statusId)?.category !== 'solved') counts.set(t.requesterId, (counts.get(t.requesterId) ?? 0) + 1);
    }
    const req = [...counts.entries()].find(([, n]) => n >= 2)![0];
    const [t, other] = useTickets.getState().tickets.filter((x) => x.requesterId === req && x.statusId !== 'solved');
    renderAt(`/agent/tickets/${t!.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Sugestões de fusão' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: `Selecionar ticket #${other!.id}` }));
    await userEvent.click(screen.getByRole('button', { name: 'Fundir' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fundir' }));
    await waitFor(() => expect(useTickets.getState().tickets.find((x) => x.id === other!.id)!.statusId).toBe('solved'));
  });
});
