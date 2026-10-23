import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ticketsApi from '@/api/tickets';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { useUi } from '@/store/useUi';
import { stopLiveUpdates, useTickets } from '@/store/useTickets';
import { BulkCloseModal } from './BulkCloseModal';

vi.mock('@/api/tickets', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/tickets')>();
  return { ...mod, bulkUpdate: vi.fn(mod.bulkUpdate), suggestResolutionWindows: vi.fn(mod.suggestResolutionWindows) };
});

const bulkUpdate = vi.mocked(ticketsApi.bulkUpdate);
const suggest = vi.mocked(ticketsApi.suggestResolutionWindows);
const iso = (s: string) => new Date(s).toISOString();

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {}, bulkClose: null });
  await useTickets.getState().load();
  bulkUpdate.mockClear();
  suggest.mockClear();
});
afterEach(() => stopLiveUpdates());

const openTickets = () => useTickets.getState().tickets.filter((t) => t.statusId !== 'solved').slice(0, 3);

describe('BulkCloseModal: fechamento em lote com confirmação (modo mock, mesmo diálogo)', () => {
  it('mudar para Resolvido NÃO grava direto: abre o diálogo com a quantidade e a janela de cada ticket', async () => {
    const [a, b, c] = openTickets();
    render(<BulkCloseModal />);
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id, b!.id, c!.id], 'solved');
    });
    expect(bulkUpdate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar fechamento de 3 tickets' });
    expect(within(dialog).getByText(/cada ticket usa a sua janela sugerida/i)).toBeInTheDocument();
    const list = await within(dialog).findByRole('list', { name: 'Janela de cada ticket' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: 'Fechar 3 tickets' })).toBeEnabled();
    expect(useTickets.getState().tickets.find((t) => t.id === a!.id)!.statusId).not.toBe('solved');
  });

  it('confirmar fecha os tickets, envia uma janela por ticket e limpa a seleção (onDone)', async () => {
    const [a, b] = openTickets();
    const onDone = vi.fn();
    render(<BulkCloseModal />);
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id, b!.id], 'solved', onDone);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar 2 tickets' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const change = bulkUpdate.mock.calls[0]![1];
    expect(change.statusId).toBe('solved');
    expect(change.resolutions!.map((r) => r.id)).toEqual([a!.id, b!.id]);
    expect(change.resolutions!.every((r) => Date.parse(r.started) <= Date.parse(r.ended))).toBe(true);
    expect(useTickets.getState().tickets.filter((t) => [a!.id, b!.id].includes(t.id)).every((t) => t.statusId === 'solved')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancelar não grava nada nem chama onDone', async () => {
    const [a] = openTickets();
    const onDone = vi.fn();
    render(<BulkCloseModal />);
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id], 'solved', onDone);
    });
    await screen.findByRole('dialog', { name: 'Confirmar fechamento do ticket' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(bulkUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(useTickets.getState().bulkClose).toBeNull();
  });

  it('tickets já fechados ficam de fora e o diálogo avisa; só fechados = aviso sem diálogo', async () => {
    const [a] = openTickets();
    const solved = useTickets.getState().tickets.find((t) => t.statusId === 'solved')!;
    render(<BulkCloseModal />);
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id, solved.id], 'solved');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar fechamento do ticket' });
    expect(within(dialog).getByText('1 ticket já estava fechado e foi ignorado.')).toBeInTheDocument();
    useTickets.getState().cancelBulkClose();
    await act(async () => {
      await useTickets.getState().requestSetStatus([solved.id], 'solved');
    });
    expect(useTickets.getState().bulkClose).toBeNull();
    expect(useUi.getState().toasts.at(-1)?.title).toBe('O ticket já está fechado.');
  });

  it('status que não é resolvido segue direto, sem diálogo', async () => {
    const [a] = openTickets();
    const onDone = vi.fn();
    await act(async () => {
      await useTickets.getState().requestSetStatus([a!.id], 'pending', onDone);
    });
    expect(useTickets.getState().bulkClose).toBeNull();
    expect(onDone).toHaveBeenCalled();
    expect(useTickets.getState().tickets.find((t) => t.id === a!.id)!.statusId).toBe('pending');
  });
});

describe('BulkCloseModal: término comum e falhas por ticket (backend real simulado)', () => {
  const suggestions = [
    { id: 1, reference: 'TD-00001', subject: 'Primeiro', createdAt: iso('2026-10-22T09:00:00Z'), started: iso('2026-10-22T09:10:00Z'), ended: iso('2026-10-22T09:50:00Z') },
    { id: 2, reference: 'TD-00002', subject: 'Segundo', createdAt: iso('2026-10-22T08:00:00Z'), started: iso('2026-10-22T08:00:00Z'), ended: iso('2026-10-22T09:50:00Z') },
  ];

  it('mostra em lista os tickets que falharam, com o motivo de cada um, e reenvia só eles', async () => {
    suggest.mockResolvedValue(suggestions);
    bulkUpdate.mockResolvedValueOnce({ updated: [], failed: [{ id: 2, message: 'Início da solução anterior à criação do ticket.' }] });
    bulkUpdate.mockResolvedValueOnce({ updated: [], failed: [] });
    render(<BulkCloseModal />);
    await act(async () => {
      useTickets.setState({ bulkClose: { statusId: 'solved', ids: [1, 2], skippedIds: [] } });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar 2 tickets' }));
    const dialog = await screen.findByRole('dialog', { name: 'Alguns tickets não foram fechados' });
    expect(within(dialog).getByText(/Início da solução anterior à criação do ticket\./)).toBeInTheDocument();
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('TD-00002');
    expect(useTickets.getState().bulkClose!.ids).toEqual([2]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }));
    expect(bulkUpdate.mock.calls[1]![0]).toEqual([2]);
    await waitFor(() => expect(useTickets.getState().bulkClose).toBeNull());
    expect(suggest).toHaveBeenCalledTimes(1); // o reenvio reaproveita as janelas já calculadas
  });

  it('editar o término comum aplica o mesmo fim a todos; término antes do início bloqueia a confirmação', async () => {
    suggest.mockResolvedValue(suggestions);
    bulkUpdate.mockResolvedValue({ updated: [], failed: [] });
    render(<BulkCloseModal />);
    await act(async () => {
      useTickets.setState({ bulkClose: { statusId: 'solved', ids: [1, 2], skippedIds: [] } });
    });
    const field = await screen.findByLabelText('Término comum (opcional)');
    // 09:05Z: antes do início do ticket 1 (09:10Z) => inválido para ele
    const local = (z: string) => {
      const d = new Date(z);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    await userEvent.clear(field);
    await userEvent.type(field, local('2026-10-22T09:05:00Z'));
    expect(await screen.findByText(/anterior ao início/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar 2 tickets' })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, local('2026-10-22T09:30:00Z'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar 2 tickets' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Fechar 2 tickets' }));
    await waitFor(() => expect(bulkUpdate).toHaveBeenCalled());
    const res = bulkUpdate.mock.calls[0]![1].resolutions!;
    expect(res.map((r) => r.ended)).toEqual([iso('2026-10-22T09:30:00Z'), iso('2026-10-22T09:30:00Z')]);
    expect(res.map((r) => r.started)).toEqual([iso('2026-10-22T09:10:00Z'), iso('2026-10-22T08:00:00Z')]);
  });

  it('erro de rede no lote inteiro: cada ticket mostra a mensagem e nada é dado como fechado', async () => {
    suggest.mockResolvedValue(suggestions);
    bulkUpdate.mockRejectedValueOnce(new Error('Sem conexão com o servidor.'));
    render(<BulkCloseModal />);
    await act(async () => {
      useTickets.setState({ bulkClose: { statusId: 'solved', ids: [1, 2], skippedIds: [] } });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar 2 tickets' }));
    expect(await screen.findAllByText('Sem conexão com o servidor.')).toHaveLength(2);
    expect(useTickets.getState().bulkClose!.ids).toEqual([1, 2]);
  });
});
