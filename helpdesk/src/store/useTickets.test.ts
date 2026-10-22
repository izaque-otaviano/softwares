import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { useUi } from './useUi';
import { liveTick, startLiveUpdates, stopLiveUpdates, useTickets } from './useTickets';

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useTickets.setState({ loaded: false, tickets: [], counts: {} });
  useUi.setState({ toasts: [] });
  await useTickets.getState().load();
});
afterEach(() => stopLiveUpdates());

describe('useTickets', () => {
  it('contadores são null (carregando) antes do load', () => {
    const fresh = useTickets.getInitialState();
    expect(Object.values(fresh.counts).every((c) => c === null)).toBe(true);
    expect(Object.keys(fresh.counts)).toHaveLength(6);
  });
  it('carrega tickets e contadores', () => {
    const s = useTickets.getState();
    expect(s.tickets).toHaveLength(30);
    expect(s.counts.unassigned).toBe(6);
  });
  it('resolver um ticket muda os contadores das views', async () => {
    const before = useTickets.getState().counts;
    const mine = useTickets.getState().ticketsForView('mine')[0];
    await useTickets.getState().setStatus([mine.id], 'solved');
    const after = useTickets.getState().counts;
    expect(after.mine).toBe((before.mine ?? 0) - 1);
    expect(after['all-unsolved']).toBe((before['all-unsolved'] ?? 0) - 1);
    expect(after['solved-recent']).toBe((before['solved-recent'] ?? 0) + 1);
  });
  it('atribuir a mim tira da fila de não atribuídos', async () => {
    const [t] = useTickets.getState().ticketsForView('unassigned');
    await useTickets.getState().assignToMe([t.id]);
    expect(useTickets.getState().counts.unassigned).toBe(5);
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)?.assigneeId).toBe('me');
  });
  it('cria, funde e apaga', async () => {
    const created = await useTickets.getState().createTicket({ subject: 'Teste', requesterId: 'u1', bodyHtml: '<p>oi</p>' });
    expect(created.id).toBe(31);
    expect(useTickets.getState().counts.unassigned).toBe(7);
    await useTickets.getState().mergeTickets(31, [1]);
    expect(useTickets.getState().tickets.find((t) => t.id === 1)?.statusId).toBe('solved');
    await useTickets.getState().deleteTickets([31]);
    expect(useTickets.getState().tickets).toHaveLength(30);
  });
  it('falha de API em ação em lote avisa e mantém o estado', async () => {
    configureApi({ failRate: 1 });
    const ok = await useTickets.getState().setPriority([1], 'urgent');
    expect(ok).toBe(false);
    expect(useUi.getState().toasts.at(-1)?.tone).toBe('error');
  });
  it('liveTick dispara toast e muda contadores; startLiveUpdates usa intervalo', () => {
    liveTick(() => 0.9);
    expect(useTickets.getState().tickets).toHaveLength(31);
    expect(useTickets.getState().counts.unassigned).toBe(7);
    expect(useUi.getState().toasts.at(-1)?.title).toContain('Novo ticket');

    vi.useFakeTimers();
    startLiveUpdates(1000);
    vi.advanceTimersByTime(3100);
    stopLiveUpdates();
    vi.useRealTimers();
    expect(useUi.getState().toasts.length).toBeGreaterThan(1);
  });
  it('editar a query de uma visão pessoal descarta a lista acumulada (o offset do "Carregar mais" deixou de valer)', async () => {
    const view = await useTickets.getState().createPersonalView('Minha', {});
    expect(view).not.toBeNull();
    useTickets.setState((st) => ({
      viewIds: { ...st.viewIds, [view!.id]: [1, 2, 3] },
      viewMeta: { ...st.viewMeta, [view!.id]: { total: 10, loaded: 3, hasMore: true } },
    }));
    await useTickets.getState().updatePersonalView(view!.id, 'Minha', { priority: 'urgent' }, { silent: true });
    expect(useTickets.getState().viewIds[view!.id]).toBeUndefined();
    expect(useTickets.getState().viewMeta[view!.id]).toBeUndefined();
    expect(useTickets.getState().views.find((v) => v.id === view!.id)?.query).toEqual({ priority: 'urgent' });
  });
});
