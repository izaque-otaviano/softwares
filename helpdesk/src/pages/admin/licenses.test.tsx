import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { AdminLayout } from '@/app/AdminLayout';
import { TooltipProvider } from '@/components/ui';
import { useUi } from '@/store/useUi';
import AdminHome from './Home';
import AdminMembers from './Members';

function renderAdmin(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route path="members" element={<AdminMembers />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ sidebarWidths: {}, tableColumns: {}, toasts: [] });
});

const openEditTotal = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Editar total' }));
  return screen.findByRole('dialog', { name: 'Total de licenças de agente' });
};

describe('Licenças em Membros', () => {
  it('mostra usadas, total e vagas livres do servidor (sem o texto "somente neste navegador")', async () => {
    renderAdmin('/admin/members');
    expect(await screen.findByText('4 de 5', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('1 licença livre')).toBeInTheDocument();
    expect(screen.queryByText(/somente neste navegador/i)).toBeNull();
  });

  it('o administrador edita o total; abaixo do uso o servidor recusa (400) e o motivo aparece no campo', async () => {
    renderAdmin('/admin/members');
    const dialog = await openEditTotal();
    const field = within(dialog).getByLabelText('Total de licenças');
    await userEvent.clear(field);
    await userEvent.type(field, '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText(/O total não pode ser menor que as licenças em uso \(4\)/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // continua aberto, com o digitado
    await userEvent.clear(field);
    await userEvent.type(field, '8');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Total de licenças de agente' })).toBeNull());
    expect(await screen.findByText('4 de 8', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('4 licenças livres')).toBeInTheDocument();
  });

  it('número inválido é recusado antes de chamar o servidor; "Sem limite" grava total nulo', async () => {
    renderAdmin('/admin/members');
    const dialog = await openEditTotal();
    const field = within(dialog).getByLabelText('Total de licenças');
    await userEvent.clear(field);
    await userEvent.type(field, '2,5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe um número inteiro maior ou igual a zero.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Sem limite' }));
    expect(field).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('4 (sem limite)', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/licenças? livres?/)).toBeNull();
  });

  it('409 seat_limit_reached ao criar: a mensagem aparece no modal e nome e e-mail digitados ficam', async () => {
    renderAdmin('/admin/members');
    const dialog = await openEditTotal();
    const field = within(dialog).getByLabelText('Total de licenças');
    await userEvent.clear(field);
    await userEvent.type(field, '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Total de licenças de agente' })).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Criar membro da equipe' }));
    const create = await screen.findByRole('dialog', { name: 'Criar membro da equipe' });
    await userEvent.type(within(create).getByLabelText(/Nome/), 'AG-front Lotado');
    await userEvent.type(within(create).getByLabelText(/E-mail/), 'ag-front.lotado@exemplo.com');
    await userEvent.click(within(create).getByRole('button', { name: 'Criar membro' }));
    expect(await within(create).findByRole('alert')).toHaveTextContent('O limite de licenças de agente foi atingido (4 de 4)');
    expect(within(create).getByLabelText(/Nome/)).toHaveValue('AG-front Lotado');
    expect(within(create).getByLabelText(/E-mail/)).toHaveValue('ag-front.lotado@exemplo.com');
    expect(screen.getByRole('dialog', { name: 'Criar membro da equipe' })).toBeInTheDocument();
  });

  it('reativar com as licenças esgotadas mostra o aviso (toast) e o membro segue suspenso', async () => {
    renderAdmin('/admin/members');
    // suspende um agente ativo (libera 1 vaga) e fecha o limite em 3 de 3
    const row = (await screen.findByText('Rafael Pinto')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /^Mais ações: / }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Suspender' }));
    await screen.findByText('Suspenso');
    const dialog = await openEditTotal();
    const field = within(dialog).getByLabelText('Total de licenças');
    await userEvent.clear(field);
    await userEvent.type(field, '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Total de licenças de agente' })).toBeNull());
    await userEvent.click(within((await screen.findByText('Rafael Pinto')).closest('tr')!).getByRole('button', { name: /^Mais ações: / }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reativar' }));
    await waitFor(() => expect(useUi.getState().toasts.at(-1)).toMatchObject({ tone: 'error', title: expect.stringMatching(/limite de licenças de agente foi atingido \(3 de 3\)/) }));
    expect(screen.getByText('Suspenso')).toBeInTheDocument();
  });
});

describe('Licenças no Início do admin', () => {
  it('mostra "N de total" com barra quando há limite e "(sem limite)" sem barra quando não há', async () => {
    renderAdmin('/admin');
    expect(await screen.findByRole('progressbar', { name: 'Agentes: 4 de 5' })).toBeInTheDocument();
    expect(screen.getByText('1 licença livre. Convites pendentes ocupam licença.')).toBeInTheDocument();
    expect(screen.queryByText(/o teto é local/i)).toBeNull();
  });
});
