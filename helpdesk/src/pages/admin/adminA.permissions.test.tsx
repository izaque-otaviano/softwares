import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAdminAMock } from '@/api/mock/adminA';
import { TooltipProvider } from '@/components/ui';

// Sem permissão de escrita: as telas abrem em modo leitura (o backend responderia 403 a qualquer escrita).
vi.mock('@/lib/permissions', async (orig) => ({ ...(await orig<typeof import('@/lib/permissions')>()), useCan: () => false }));

const { default: AdminSla } = await import('./Sla');
const { default: AdminPlans } = await import('./Plans');
const { default: AdminAnnouncements } = await import('./Announcements');
const { default: AdminBackups } = await import('./Backups');
const { default: AdminCalendars } = await import('./Calendars');

const renderPage = (ui: React.ReactElement) =>
  render(
    <TooltipProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </TooltipProvider>,
  );

beforeEach(() => resetAdminAMock());

describe('modo leitura (sem permissão de escrita)', () => {
  it('SLA: explica, esconde "Nova política" e abre a política só para consulta', async () => {
    const user = userEvent.setup();
    renderPage(<AdminSla />);
    expect(await screen.findByText('SLA Black (geral)')).toBeInTheDocument();
    expect(screen.getByText(/só administradores criam, editam ou excluem/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova política' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'SLA Black (geral)' }));
    const dlg = await screen.findByRole('dialog', { name: 'Política de SLA' });
    expect(within(dlg).getByRole('textbox', { name: /Nome/ })).toBeDisabled();
    expect(within(dlg).queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('Planos, Calendários e Avisos: sem botões de criar', async () => {
    const plans = renderPage(<AdminPlans />);
    await screen.findByText('Black');
    expect(screen.queryByRole('button', { name: 'Novo plano' })).not.toBeInTheDocument();
    plans.unmount();
    const cal = renderPage(<AdminCalendars />);
    await screen.findByText('Horário comercial');
    expect(screen.queryByRole('button', { name: 'Novo calendário' })).not.toBeInTheDocument();
    cal.unmount();
    renderPage(<AdminAnnouncements />);
    await screen.findByText('Recesso de fim de ano');
    expect(screen.queryByRole('button', { name: 'Novo aviso' })).not.toBeInTheDocument();
    expect(screen.getByText(/Você vê os avisos destinados a você/)).toBeInTheDocument();
  });

  it('Backups: sem "Criar backup agora" e sem menu de ações por arquivo', async () => {
    renderPage(<AdminBackups />);
    await screen.findByText('resolv-20261022-230000.sql.gz');
    expect(screen.queryByRole('button', { name: 'Criar backup agora' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Backups são restritos a administradores/)).toBeInTheDocument();
  });
});
