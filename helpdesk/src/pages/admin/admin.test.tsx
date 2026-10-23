import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi, resetDb } from '@/api';
import { AdminLayout } from '@/app/AdminLayout';
import { resourceRows } from './Home';
import { TooltipProvider } from '@/components/ui';
import { macros, triggers } from '@/api/mock/data';
import { useUi } from '@/store/useUi';
import AdminFields from './Fields';
import AdminGroups from './Groups';
import AdminHome from './Home';
import AdminMembers from './Members';
import AdminOutOfScope from './OutOfScope';
import AdminRoles from './Roles';

function Loc() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

function renderAdmin(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHome />} />
            <Route path="members" element={<AdminMembers />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="groups" element={<AdminGroups />} />
            <Route path="fields" element={<AdminFields />} />
            <Route path="*" element={<AdminOutOfScope />} />
          </Route>
          <Route path="/agent/home" element={<div>Área do agente</div>} />
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

describe('AdminLayout', () => {
  it('mostra a TopBar, o rail e o painel de 2 níveis', async () => {
    renderAdmin('/admin/members');
    expect(screen.getByRole('button', { name: /Central de administração/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Pesquisar central de administração' })).toBeInTheDocument();
    const rail = screen.getByRole('navigation', { name: 'Seções da administração' });
    for (const n of ['Início', 'Conta', 'Pessoas', 'Canais', 'Espaços de trabalho', 'Objetos e regras']) {
      expect(within(rail).getByRole('link', { name: n })).toBeInTheDocument();
    }
    const panel = screen.getByRole('navigation', { name: 'Pessoas' });
    expect(within(panel).getByRole('link', { name: 'Membros da equipe' })).toHaveAttribute('aria-current', 'page');
    expect(within(panel).getByRole('link', { name: 'Funções' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Grupos' })).toBeInTheDocument();
    expect(await screen.findByText('Convite pendente')).toBeInTheDocument();
  });

  it('volta para Suporte pelo seletor', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin');
    await user.click(screen.getByRole('button', { name: /Central de administração/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Suporte' }));
    expect(screen.getByText('Área do agente')).toBeInTheDocument();
  });

  it('abre o Copiloto e responde a uma sugestão', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin');
    await user.click(screen.getByRole('button', { name: 'Copiloto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Como posso ajudar?' });
    await user.click(within(dialog).getByRole('button', { name: 'Como criar um gatilho?' }));
    expect(await within(dialog).findByText(/Criar gatilho/)).toBeInTheDocument();
  });

  it('Canais abre página de e-mail; Marca continua fora desta versão', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin');
    await user.click(screen.getByRole('link', { name: 'Canais' }));
    expect(await screen.findByRole('heading', { name: 'E-mail' })).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/canais/email');
    await user.click(screen.getByRole('link', { name: 'Conta' }));
    await user.click(await screen.findByRole('link', { name: 'Marca' }));
    expect(await screen.findByText('Fora desta versão')).toBeInTheDocument();
  });

  it('a busca da TopBar navega ao primeiro resultado', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin');
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar central de administração' }), 'grupos{Enter}');
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/groups');
  });
});

describe('Início', () => {
  it('mostra saudação, recomendações vazias, uso e uso de recursos', async () => {
    renderAdmin('/admin');
    expect(screen.getByRole('heading', { name: /Olá/ })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma recomendação à vista')).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: 'Agentes: 4 de 5' })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    const table = await screen.findByRole('table', { name: 'Uso de recursos' });
    expect(within(table).getByText('Macros')).toBeInTheDocument();
    expect(within(table).getByText('Gatilhos')).toBeInTheDocument();
  });

  it('calcula os recursos a partir dos mocks', () => {
    const [m, t] = resourceRows(macros, triggers);
    expect(m!.active).toBe(macros.filter((x) => x.active).length);
    expect(t!.unused30d).toBe(triggers.filter((x) => x.active && x.fired7d === 0).length);
    expect(t!.runs24h).toBe(Math.round(triggers.filter((x) => x.active).reduce((n, x) => n + x.fired7d, 0) / 7));
  });
});

describe('Membros da equipe', () => {
  it('lista, filtra e cria um membro', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/members');
    expect(await screen.findByText('Agentes', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('4 de 5', { exact: false })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Membros da equipe' });
    for (const h of ['Membro', 'Grupo', 'Acesso a produtos', 'Função', 'Último acesso']) {
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar membros' }), 'rafael');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await user.clear(screen.getByRole('searchbox', { name: 'Pesquisar membros' }));

    await user.click(screen.getByRole('button', { name: 'Criar membro da equipe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Criar membro da equipe' });
    await user.click(within(dialog).getByRole('button', { name: 'Criar membro' }));
    expect(within(dialog).getByText('Informe o nome.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nome/), 'Paula Nunes');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'paula.nunes@resolv.com.br');
    await user.click(within(dialog).getByRole('button', { name: 'Criar membro' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Paula Nunes')).toBeInTheDocument();
  });

  it('erro com Tentar novamente', async () => {
    const user = userEvent.setup();
    configureApi({ failRate: 1 });
    renderAdmin('/admin/members');
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    configureApi({ failRate: 0 });
    await user.click(retry);
    expect(await screen.findByText('Rafael Pinto')).toBeInTheDocument();
  });
});

describe('Funções e Grupos', () => {
  it('Funções', async () => {
    renderAdmin('/admin/roles');
    expect(await screen.findByText('Administrador', { selector: 'span' })).toBeInTheDocument();
  });
  it('Grupos', async () => {
    renderAdmin('/admin/groups');
    expect(await screen.findByText('Suporte N1')).toBeInTheDocument();
  });
});

describe('Campos', () => {
  it('mostra os campos personalizados ativos e os campos padrão sem edição', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    const table = await screen.findByRole('table', { name: 'Campos' });
    expect(await within(table).findByRole('button', { name: 'Número do contrato' })).toBeInTheDocument();
    // Padrão do front (9) + campos de IA (7): texto simples, sem botão de edição.
    expect(within(table).getAllByText('Campo padrão')).toHaveLength(16);
    expect(within(table).queryByRole('button', { name: 'Assunto' })).not.toBeInTheDocument();
    expect(within(table).queryByText('Grupo do canal')).not.toBeInTheDocument();
    expect(screen.getByText('Ativos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover filtro Ativos' }));
    expect(await within(table).findByText('Grupo do canal')).toBeInTheDocument();
  });

  it('adiciona um campo', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Número do contrato' });
    await user.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar campo' });
    await user.type(within(dialog).getByLabelText(/Título/), 'Número do pedido');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar campo' }));
    expect(await screen.findByRole('button', { name: 'Número do pedido' })).toBeInTheDocument();
    expect(screen.getByText('numero_do_pedido')).toBeInTheDocument();
  });

  it('desativa e apaga com confirmação; campo já usado sugere desativar; campos padrão não têm ações', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Observações internas' });
    expect(screen.queryByRole('button', { name: /Mais ações.*Assunto/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mais ações.*Observações internas/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Observações internas' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Mais ações.*Valor em disputa$/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Apagar campo?' });
    await user.click(within(confirm).getByRole('button', { name: 'Apagar campo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Valor em disputa' })).not.toBeInTheDocument());

    // 409 field_in_use: o contrato já tem valor em tickets -> sugere desativar
    await user.click(screen.getByRole('button', { name: /Mais ações.*Número do contrato$/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apagar' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Apagar campo?' })).getByRole('button', { name: 'Apagar campo' }));
    const inUse = await screen.findByRole('dialog', { name: 'Este campo já foi usado em tickets' });
    await user.click(within(inUse).getByRole('button', { name: 'Desativar campo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Número do contrato' })).not.toBeInTheDocument());
  });

  it('colunas configuráveis', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/fields');
    await screen.findByRole('button', { name: 'Número do contrato' });
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Identificador' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader', { name: /Identificador/ })).not.toBeInTheDocument();
  });
});
