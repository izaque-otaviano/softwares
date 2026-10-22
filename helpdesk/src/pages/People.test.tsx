import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi, resetDb, usersApi } from '@/api';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { openNewTicketFor } from '@/components/people/peopleUtils';
import { useFormStore } from '@/components/ticket/formStore';
import { TooltipProvider } from '@/components/ui';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import Customer from './Customer';
import Customers, { resetCustomersTip } from './Customers';
import Org from './Org';
import Orgs from './Orgs';

const openUser = vi.fn();
const openOrg = vi.fn();
const openTicket = vi.fn();
vi.mock('@/components/shell/openTab', async (orig) => ({
  ...(await orig<typeof import('@/components/shell/openTab')>()),
  openUser: (...a: unknown[]) => openUser(...a),
  openOrg: (...a: unknown[]) => openOrg(...a),
  openTicket: (...a: unknown[]) => openTicket(...a),
}));

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/agent/customers" element={<Customers />} />
          <Route path="/agent/customers/:id" element={<Customer />} />
          <Route path="/agent/orgs" element={<Orgs />} />
          <Route path="/agent/orgs/:id" element={<Org />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

const toasts = () => useUi.getState().toasts.map((t) => t.title);
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

beforeEach(async () => {
  resetDb();
  resetDirectoryCache();
  resetCustomersTip();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ toasts: [], tableColumns: {} });
  useTabs.setState({ tabs: [], activeTabId: null });
  useFormStore.setState({ forms: {} });
  openUser.mockClear();
  openOrg.mockClear();
  openTicket.mockClear();
  await useTickets.getState().load();
});

describe('Lista de clientes', () => {
  it('mostra contador, ordena por atualização desc e filtra pela busca', async () => {
    const user = userEvent.setup();
    renderAt('/agent/customers');
    await screen.findByRole('link', { name: 'Todos os clientes' });
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(1));
    const total = (await usersApi.listUsers({ role: 'end_user' })).length;
    expect(screen.getByText(`${total} clientes`)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Pesquisar clientes' }), 'carlos');
    await waitFor(() => expect(screen.getByText('1 cliente')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Carlos Menezes' }));
    expect(openUser).toHaveBeenCalledWith('u1', 'Carlos Menezes');
  });

  it('dica some ao clicar em Concluído e fica dispensada em memória', async () => {
    const user = userEvent.setup();
    const first = renderAt('/agent/customers');
    await user.click(await screen.findByRole('button', { name: 'Concluído' }));
    expect(screen.queryByText('Todos os seus clientes em um só lugar')).not.toBeInTheDocument();
    first.unmount();
    renderAt('/agent/customers');
    await screen.findByRole('textbox', { name: 'Pesquisar clientes' });
    expect(screen.queryByText('Todos os seus clientes em um só lugar')).not.toBeInTheDocument();
  });

  it('Importar em massa mostra toast; Adicionar cliente valida e-mail e cria', async () => {
    const user = userEvent.setup();
    renderAt('/agent/customers');
    await user.click(await screen.findByRole('button', { name: /Importar em massa/ }));
    expect(toasts().some((t) => /fora desta versão/.test(t))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Adicionar cliente' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Nome/), 'Maria Teste');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'invalido');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(await within(dialog).findByText('Informe um e-mail válido.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/E-mail/));
    await user.type(within(dialog).getByLabelText(/E-mail/), 'maria@teste.com');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(toasts()).toContain('Cliente “Maria Teste” foi criado'));
    expect(await screen.findByRole('button', { name: 'Maria Teste' })).toBeInTheDocument();
  });

  it('mostra estado de erro com Tentar novamente', async () => {
    const user = userEvent.setup();
    configureApi({ failRate: 1 });
    renderAt('/agent/customers');
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    configureApi({ failRate: 0 });
    await user.click(retry);
    await screen.findByRole('button', { name: 'Carlos Menezes' });
  });
});

describe('Perfil do cliente', () => {
  it('edita propriedades só ao salvar e marca a aba como não salva', async () => {
    const user = userEvent.setup();
    useTabs.getState().openTab({ kind: 'user', refId: 'u1', title: 'Carlos' });
    renderAt('/agent/customers/u1');
    const email = await screen.findByLabelText(/E-mail principal/);
    await user.clear(email);
    await user.type(email, 'novo@horizonte.com.br');
    expect(useTabs.getState().tabs[0]?.dirty).toBe(true);
    expect((await usersApi.getUser('u1')).email).toBe('carlos.menezes@horizonte.com.br');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(toasts()).toContain('Cliente atualizado'));
    expect((await usersApi.getUser('u1')).email).toBe('novo@horizonte.com.br');
    expect(useTabs.getState().tabs[0]?.dirty).toBe(false);
  });

  it('valida e-mail ao salvar', async () => {
    const user = userEvent.setup();
    renderAt('/agent/customers/u1');
    const email = await screen.findByLabelText(/E-mail principal/);
    await user.clear(email);
    await user.type(email, 'x');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
  });

  it('lista tickets solicitados, abre o ticket e redefine a senha', async () => {
    const user = userEvent.setup();
    renderAt('/agent/customers/u1');
    const n = useTickets.getState().tickets.filter((t) => t.requesterId === 'u1').length;
    expect(await screen.findByRole('tab', { name: `Tickets (${n})` })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de ticket' })).toHaveTextContent(`Tickets solicitados (${n})`);
    await waitFor(() => expect(bodyRows().length).toBe(n));
    await user.click(within(bodyRows()[0]!).getAllByRole('cell')[2]!);
    expect(openTicket).toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: 'Configurações de segurança' }));
    expect(screen.getByText('●●●●●●●●●●')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redefinir' }));
    expect(toasts().some((t) => /redefinição de senha/.test(t))).toBe(true);
  });

  it('apaga o cliente com confirmação', async () => {
    const user = userEvent.setup();
    renderAt('/agent/customers/u2');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: 'Mais ações do cliente' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    const dialog = await screen.findByRole('dialog');
    expect((await usersApi.listUsers()).some((u) => u.id === 'u2')).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(toasts().some((t) => /foi apagado$/.test(t))).toBe(true), { timeout: 3000 });
    expect((await usersApi.listUsers()).some((u) => u.id === 'u2')).toBe(false);
  });

  it('mostra 404 para cliente inexistente', async () => {
    renderAt('/agent/customers/nao-existe');
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });

  it('+ Novo ticket abre o novo ticket com o solicitante preenchido', () => {
    openNewTicketFor('u1');
    const key = useTabs.getState().activeTabId!;
    expect(key.startsWith('new-ticket:')).toBe(true);
    expect(useFormStore.getState().forms[key]?.values.requesterId).toBe('u1');
  });
});

describe('Organizações', () => {
  it('lista, busca e abre a organização', async () => {
    const user = userEvent.setup();
    renderAt('/agent/orgs');
    await waitFor(() => expect(bodyRows().length).toBe(4));
    await user.type(screen.getByRole('textbox', { name: 'Pesquisar organizações' }), 'clínica');
    await waitFor(() => expect(bodyRows().length).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Clínica Vida Plena' }));
    expect(openOrg).toHaveBeenCalledWith('o2', 'Clínica Vida Plena');
  });

  it('adiciona organização pelo modal', async () => {
    const user = userEvent.setup();
    renderAt('/agent/orgs');
    await user.click(await screen.findByRole('button', { name: 'Adicionar organização' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(await within(dialog).findByText('Informe o nome da organização.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nome/), 'Nova Org');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(toasts()).toContain('Organização “Nova Org” foi criada'));
    expect(await screen.findByRole('button', { name: 'Nova Org' })).toBeInTheDocument();
  });

  it('perfil mostra contadores de abas e apaga com confirmação', async () => {
    const user = userEvent.setup();
    renderAt('/agent/orgs/o3');
    expect(await screen.findByRole('tab', { name: /^Usuários \(\d+\)$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar organização' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apagar organização' }));
    await waitFor(() => expect(toasts()).toContain('Transportes Rápido Sul foi apagada'), { timeout: 3000 });
  });

  it('mostra 404 para organização inexistente', async () => {
    renderAt('/agent/orgs/xx');
    expect(await screen.findByText('Organização não encontrada')).toBeInTheDocument();
  });
});
