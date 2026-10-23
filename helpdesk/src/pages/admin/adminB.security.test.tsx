import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi } from '@/api';
import { UserSecurityPanel } from '@/components/admin/security/UserSecurityPanel';
import { TooltipProvider } from '@/components/ui';
import { useUi } from '@/store/useUi';
import AdminSecurity from './Security';

const Loc = () => <div data-testid="loc">{useLocation().pathname}</div>;

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <Routes>
          <Route path="/admin/seguranca/*" element={<AdminSecurity />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ tableColumns: {}, toasts: [] });
});

describe('Segurança: verificação em duas etapas (fetch simulado = mock em memória)', () => {
  it('ativa por e-mail com código válido e desativa pedindo outro código', async () => {
    const user = userEvent.setup();
    renderAt('/admin/seguranca');
    await user.click(await screen.findByRole('button', { name: 'Ativar verificação em duas etapas' }));
    const code = await screen.findByRole('textbox', { name: /Código de 6 dígitos/ });
    const confirm = screen.getByRole('button', { name: 'Confirmar e ativar' });
    expect(confirm).toBeDisabled();
    await user.type(code, '000000');
    await user.click(confirm);
    expect(await screen.findByText('Código inválido ou expirado.')).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, '123456');
    await user.click(confirm);
    expect(await screen.findByText('Ativada: Código por e-mail')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desativar verificação em duas etapas' }));
    const dlg = await screen.findByRole('dialog', { name: 'Desativar verificação em duas etapas' });
    const off = within(dlg).getByRole('button', { name: 'Desativar' });
    expect(off).toBeDisabled();
    await user.click(within(dlg).getByRole('button', { name: 'Enviar código por e-mail' }));
    await user.type(await within(dlg).findByRole('textbox', { name: /Código de 6 dígitos/ }), '123456');
    await user.click(off);
    await waitFor(() => expect(screen.getByText('Desativada', { selector: 'span' })).toBeInTheDocument());
  });

  it('aplicativo autenticador mostra a chave de configuração', async () => {
    const user = userEvent.setup();
    renderAt('/admin/seguranca');
    await user.click(await screen.findByRole('combobox', { name: 'Método de verificação' }));
    await user.click(await screen.findByRole('option', { name: 'Aplicativo autenticador' }));
    await user.click(screen.getByRole('button', { name: 'Ativar verificação em duas etapas' }));
    expect(await screen.findByRole('textbox', { name: 'Chave de configuração do aplicativo' })).toHaveValue('JBSWY3DPEHPK3PXP');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('button', { name: 'Ativar verificação em duas etapas' })).toBeInTheDocument();
  });
});

describe('Segurança: sessões, histórico e senha', () => {
  it('a sessão atual não tem ação; encerrar outra pede confirmação', async () => {
    const user = userEvent.setup();
    renderAt('/admin/seguranca/sessoes');
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/seguranca/sessoes');
    expect(await screen.findByText('Este dispositivo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações: Sessão em Chrome · Linux/ })).toBeNull();
    const kebabs = screen.getAllByRole('button', { name: /Mais ações/ });
    expect(kebabs).toHaveLength(1);
    await user.click(kebabs[0]!);
    await user.click(await screen.findByRole('menuitem', { name: 'Encerrar sessão' }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog', { name: 'Encerrar sessão' }));
    expect(within(dlg).getByText(/será desconectada agora/)).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Encerrar sessão' }));
    await waitFor(() => expect(screen.queryByText('Firefox · Windows')).not.toBeInTheDocument());
    expect(screen.getByText('Chrome · Linux')).toBeInTheDocument();
  });

  it('histórico mostra falha de login destacada', async () => {
    renderAt('/admin/seguranca/historico');
    expect((await screen.findAllByText('Login falhou')).length).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: 'Linha do tempo da sua conta' })).toBeInTheDocument();
  });

  it('senha: confirma divergência e mostra o erro do campo vindo do servidor', async () => {
    const user = userEvent.setup();
    renderAt('/admin/seguranca/senha');
    await user.type(await screen.findByLabelText(/Senha atual/), 'errada');
    await user.type(screen.getByLabelText(/^Nova senha/), 'nova-senha-123');
    await user.type(screen.getByLabelText(/Repita a nova senha/), 'outra');
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar senha' })).toBeDisabled();
    await user.clear(screen.getByLabelText(/Repita a nova senha/));
    await user.type(screen.getByLabelText(/Repita a nova senha/), 'nova-senha-123');
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument();
  });

  it('meus dados: pede exportação e lista o pedido', async () => {
    const user = userEvent.setup();
    renderAt('/admin/seguranca/dados');
    expect(await screen.findByText('Você ainda não fez nenhum pedido.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pedir exportação dos meus dados' }));
    expect(await screen.findByText('Em execução')).toBeInTheDocument();
  });
});

describe('Componente do administrador sobre outro usuário', () => {
  it('lista sessões, encerra uma e todas', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <UserSecurityPanel userId="42" userName="Beto Barros" />
      </TooltipProvider>,
    );
    expect(await screen.findByText('Safari · macOS', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sessões (1 de 3)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Encerrar todas as sessões' }));
    const dlg = await screen.findByRole('dialog', { name: 'Encerrar todas as sessões' });
    expect(within(dlg).getByText(/será desconectado\(a\) de todos os dispositivos/)).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Encerrar todas' }));
    expect(await screen.findByText('Nenhuma sessão aberta')).toBeInTheDocument();
  });

  it('sem permissão de gerenciar fica só leitura', async () => {
    render(
      <TooltipProvider>
        <UserSecurityPanel userId="77" userName="Carla Costa" canManage={false} />
      </TooltipProvider>,
    );
    await screen.findByText('Safari · macOS', { selector: 'span' });
    expect(screen.queryByRole('button', { name: 'Encerrar todas as sessões' })).toBeNull();
  });
});
