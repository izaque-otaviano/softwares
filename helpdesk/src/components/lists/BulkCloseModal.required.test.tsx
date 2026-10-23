import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { ticketsApi } from '@/api';
import { useTabs } from '@/store/useTabs';
import { useUi } from '@/store/useUi';
import { stopLiveUpdates, useTickets } from '@/store/useTickets';
import { BulkCloseModal } from './BulkCloseModal';

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ toasts: [] });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {}, bulkClose: null });
  await useTickets.getState().load();
});
afterEach(() => stopLiveUpdates());

describe('BulkCloseModal: campos obrigatórios pendentes (failed[])', () => {
  it('o ticket com pendência fica na lista com os NOMES dos campos e um atalho para abri-lo; os demais fecham', async () => {
    const [a, b] = useTickets.getState().tickets.filter((t) => t.formId === '2' && t.statusId !== 'solved');
    await ticketsApi.updateTicket(a!.id, { fieldValues: { numero_do_contrato: null, severidade: null } });
    await useTickets.getState().load();
    render(
      <MemoryRouter>
        <BulkCloseModal />
      </MemoryRouter>,
    );
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id, b!.id], 'solved');
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar 2 tickets' }));
    const dialog = await screen.findByRole('dialog', { name: 'Alguns tickets não foram fechados' });
    const alert = await within(dialog).findByText('Campos obrigatórios pendentes: Número do contrato, Severidade.');
    expect(alert).toBeInTheDocument();
    expect(db.tickets.find((t) => t.id === b!.id)!.statusId).toBe('solved');
    expect(db.tickets.find((t) => t.id === a!.id)!.statusId).not.toBe('solved');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir ticket para preencher' }));
    await waitFor(() => expect(useTickets.getState().bulkClose).toBeNull());
    expect(useTabs.getState().tabs.some((t) => t.id === `ticket:${a!.id}`)).toBe(true);
  });
});
