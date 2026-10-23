import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { configureApi } from '@/api';
import { NotificationBell } from '@/components/admin/notifications/NotificationBell';
import { TooltipProvider } from '@/components/ui';
import { useNotifications } from '@/store/useNotifications';
import { useUi } from '@/store/useUi';
import AdminNotificationPrefs from './NotificationPrefs';

const Loc = () => <div data-testid="loc">{useLocation().pathname}</div>;

function renderAt(path: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <NotificationBell />
        <Routes>
          <Route path="/admin/notificacoes/*" element={<AdminNotificationPrefs />} />
          <Route path="/tickets/:id" element={<div>Ticket aberto</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ tableColumns: {}, toasts: [] });
  useNotifications.getState().reset();
});

describe('Notificações: preferências', () => {
  it('só grava ao salvar; descartar volta ao salvo', async () => {
    const user = userEvent.setup();
    renderAt('/admin/notificacoes');
    const sw = await screen.findByRole('switch', { name: 'Menção, por e-mail' });
    const save = screen.getByRole('button', { name: 'Salvar preferências' });
    expect(sw).toBeChecked();
    expect(save).toBeDisabled();
    await user.click(sw);
    expect(sw).not.toBeChecked();
    expect(save).toBeEnabled();
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.getByRole('switch', { name: 'Menção, por e-mail' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Ticket novo, no aplicativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled());
    expect(screen.getByRole('switch', { name: 'Ticket novo, no aplicativo' })).not.toBeChecked();
    expect(useUi.getState().toasts.some((t) => t.title === 'Preferências salvas')).toBe(true);
  });

  it('cada tipo tem os dois canais com nome acessível', async () => {
    renderAt('/admin/notificacoes');
    await screen.findByRole('switch', { name: 'Menção, no aplicativo' });
    expect(screen.getAllByRole('switch')).toHaveLength(32);
  });
});

describe('Notificações: central e sino', () => {
  it('central: filtra não lidas, marca uma e todas como lidas e atualiza o sino', async () => {
    const user = userEvent.setup();
    renderAt('/admin/notificacoes/central');
    expect(screen.getByTestId('loc')).toHaveTextContent('/admin/notificacoes/central');
    const list = await screen.findByRole('list', { name: 'Notificações' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    await user.click(screen.getByRole('checkbox', { name: /Somente não lidas/ }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Notificações' })).getAllByRole('listitem')).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: 'Marcar como lida: SLA próximo do limite: TD-00012' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Notificações' })).getAllByRole('listitem')).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificações, 2 não lidas' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));
    expect(await screen.findByText('Nenhuma notificação não lida')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificações, nenhuma não lida' })).toBeInTheDocument());
  });

  it('o sino abre o painel e clicar numa notificação marca como lida e navega', async () => {
    const user = userEvent.setup();
    // estado do mock persiste entre testes do arquivo: garante uma não lida
    renderAt('/admin/notificacoes');
    await screen.findByRole('switch', { name: 'Menção, no aplicativo' });
    await act(async () => {
      await useNotifications.getState().refresh();
    });
    await user.click(screen.getByRole('button', { name: /^Notificações,/ }));
    const panel = await screen.findByRole('dialog', { name: 'Notificações' });
    expect(within(panel).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/admin/notificacoes/central');
    await user.click(within(panel).getByRole('button', { name: /Ticket atribuído a você: TD-00024/ }));
    expect(await screen.findByText('Ticket aberto')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/tickets/24');
  });
});
