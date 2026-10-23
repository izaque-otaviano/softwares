import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/api/mock/db';
import { resetBoardMock } from '@/api/mock/board';
import { ApiError } from '@/api/errors';
import * as boardApi from '@/api/board';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { resetBoardStore, startBoardLive, useBoard } from './board';

vi.mock('@/api/board', async (orig) => {
  const real = await orig<typeof import('@/api/board')>();
  return { ...real, placeCard: vi.fn(real.placeCard) };
});

const place = vi.mocked(boardApi.placeCard);
const card = (id: number) => useBoard.getState().data!.cards.find((c) => c.ticketId === id)!;
const toasts = () => useUi.getState().toasts;

beforeEach(async () => {
  resetDb();
  resetBoardMock();
  resetBoardStore();
  useUi.setState({ toasts: [] });
  place.mockClear();
  await useBoard.getState().loadBoards();
});
afterEach(() => vi.restoreAllMocks());

describe('store do quadro (mock)', () => {
  it('carrega os quadros, escolhe o primeiro e monta as colunas', () => {
    const s = useBoard.getState();
    expect(s.boards.length).toBeGreaterThan(1);
    expect(s.activeId).toBe(s.boards[0]!.id);
    expect(s.phase).toBe('ready');
    expect(s.data!.columns.some((c) => c.kind === 'lane')).toBe(true);
    expect(s.data!.columns.some((c) => c.concludes)).toBe(true);
  });

  it('mover para outra coluna de status: otimista, grava e muda o status do ticket', async () => {
    const data = useBoard.getState().data!;
    const target = data.columns.find((c) => c.kind === 'stage' && !c.concludes && c.key !== data.cards[0]!.columnKey)!;
    const id = data.cards.find((c) => c.columnKey !== target.key && !c.columnKey.startsWith('lane-'))!.ticketId;
    const p = useBoard.getState().moveCard(id, target.key);
    expect(card(id).columnKey).toBe(target.key); // já mudou antes da resposta
    expect(useBoard.getState().busy).toContain(id);
    expect(await p).toBe(true);
    expect(card(id).columnKey).toBe(target.key);
    expect(useBoard.getState().busy).not.toContain(id);
  });

  it('o backend recusa: o cartão volta, com aviso', async () => {
    const data = useBoard.getState().data!;
    const c = data.cards.find((x) => !x.columnKey.startsWith('lane-'))!;
    const target = data.columns.find((x) => x.kind === 'stage' && !x.concludes && x.key !== c.columnKey)!;
    place.mockRejectedValueOnce(new ApiError('Você não tem permissão para esta ação.', { status: 403 }));
    const ok = await useBoard.getState().moveCard(c.ticketId, target.key);
    expect(ok).toBe(false);
    expect(card(c.ticketId).columnKey).toBe(c.columnKey);
    expect(useBoard.getState().busy).toEqual([]);
    expect(toasts().map((t) => t.title).join(' ')).toContain(`Não foi possível mover ${c.reference}`);
    expect(toasts().some((t) => t.description?.includes('permissão'))).toBe(true);
    expect(toasts().some((t) => t.title.includes('voltou para'))).toBe(true);
  });

  it('coluna de conclusão: nem chama o backend, avisa', async () => {
    const data = useBoard.getState().data!;
    const done = data.columns.find((c) => c.concludes)!;
    const ok = await useBoard.getState().moveCard(data.cards[0]!.ticketId, done.key);
    expect(ok).toBe(false);
    expect(place).not.toHaveBeenCalled();
    expect(toasts()[0]!.title).toMatch(/não pode ser concluído arrastando/);
  });

  it('reordenar na mesma coluna é local: sem chamada ao backend e a ordem fica guardada', async () => {
    const data = useBoard.getState().data!;
    const colKey = data.columns.find((c) => data.cards.filter((x) => x.columnKey === c.key).length >= 3)!.key;
    const ids = data.cards.filter((c) => c.columnKey === colKey).map((c) => c.ticketId);
    await useBoard.getState().moveCard(ids[2]!, colKey, ids[0]);
    expect(place).not.toHaveBeenCalled();
    const board = useBoard.getState().activeId!;
    expect(useBoard.getState().localOrder[board]![colKey]!.slice(0, 3)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('pedidos em paralelo: a falha de um reverte só ele', async () => {
    const data = useBoard.getState().data!;
    const [a, b] = data.cards.filter((x) => !x.columnKey.startsWith('lane-')).slice(0, 2);
    const target = data.columns.find((x) => x.kind === 'stage' && !x.concludes && x.key !== a!.columnKey && x.key !== b!.columnKey)!;
    place.mockRejectedValueOnce(new ApiError('Não encontrado.', { status: 404 }));
    const [ra, rb] = await Promise.all([useBoard.getState().moveCard(a!.ticketId, target.key), useBoard.getState().moveCard(b!.ticketId, target.key)]);
    expect([ra, rb]).toEqual([false, true]);
    expect(card(a!.ticketId).columnKey).toBe(a!.columnKey);
    expect(card(b!.ticketId).columnKey).toBe(target.key);
  });

  it('coluna de organização: criar, fixar, soltar, reordenar e excluir', async () => {
    const s = useBoard.getState();
    expect(await s.createLane('AG-board nova')).toBe(true);
    let lanes = useBoard.getState().data!.columns.filter((c) => c.kind === 'lane');
    const created = lanes.find((l) => l.name === 'AG-board nova')!;
    const c = useBoard.getState().data!.cards.find((x) => !x.columnKey.startsWith('lane-'))!;
    await useBoard.getState().moveCard(c.ticketId, created.key);
    expect(card(c.ticketId)).toMatchObject({ columnKey: created.key, stageKey: c.stageKey });
    await useBoard.getState().moveCard(c.ticketId, c.stageKey!);
    expect(card(c.ticketId).columnKey).toBe(c.stageKey);
    await useBoard.getState().moveLane(created.laneId!, -1);
    lanes = useBoard.getState().data!.columns.filter((l) => l.kind === 'lane');
    expect(lanes.map((l) => l.name)).toEqual(['Depende do gestor', 'AG-board nova', 'Sprint desta semana']);
    expect(await useBoard.getState().deleteLane(created.laneId!)).toBe(true);
    expect(useBoard.getState().data!.columns.some((l) => l.name === 'AG-board nova')).toBe(false);
    expect(await useBoard.getState().createLane('Depende do gestor')).toBe(false); // nome repetido
    expect(toasts().some((t) => t.title === 'Não foi possível criar a coluna')).toBe(true);
  });

  it('prazo interno e limite de trabalho', async () => {
    const c = useBoard.getState().data!.cards[0]!;
    await useBoard.getState().setDue(c.ticketId, '2020-01-01T18:00:00.000Z');
    expect(card(c.ticketId)).toMatchObject({ dueAt: '2020-01-01T18:00:00.000Z', overdue: true });
    await useBoard.getState().setDue(c.ticketId, null);
    expect(card(c.ticketId).dueAt).toBeUndefined();
    const stage = useBoard.getState().data!.columns.find((x) => x.kind === 'stage' && !x.concludes)!;
    await useBoard.getState().setWipLimit(stage.key, 2);
    expect(useBoard.getState().data!.columns.find((x) => x.key === stage.key)!.wipLimit).toBe(2);
    expect(await useBoard.getState().setWipLimit(stage.key, 0)).toBe(false);
  });

  it('criar, trocar, renomear e excluir quadro', async () => {
    expect(await useBoard.getState().createBoard('AG-board extra')).toBe(true);
    const s = useBoard.getState();
    expect(s.boards.at(-1)!.name).toBe('AG-board extra');
    expect(s.activeId).toBe(s.boards.at(-1)!.id);
    expect(await s.renameBoard('AG-board renomeado')).toBe(true);
    expect(useBoard.getState().boards.at(-1)!.name).toBe('AG-board renomeado');
    expect(await useBoard.getState().deleteBoard()).toBe(true);
    expect(useBoard.getState().boards.some((b) => b.name.startsWith('AG-board'))).toBe(false);
    expect(useBoard.getState().activeId).toBe(useBoard.getState().boards[0]!.id);
  });

  it('erro ao carregar o quadro vira estado de erro e Tentar novamente recarrega', async () => {
    // o erro é simulado apontando para um quadro que não existe (404 do mock)
    useBoard.setState({ activeId: 999 });
    await useBoard.getState().reload();
    expect(useBoard.getState().phase).toBe('error');
    expect(useBoard.getState().error).toMatch(/Quadro não encontrado/);
    useBoard.setState({ activeId: 1 });
    await useBoard.getState().reload();
    expect(useBoard.getState().phase).toBe('ready');
  });
});

describe('tempo real', () => {
  it('quando um ticket muda na lista do app (evento do WebSocket), o quadro recarrega em segundo plano', async () => {
    vi.useFakeTimers();
    try {
      const stop = startBoardLive(50);
      const before = useBoard.getState().data;
      const t = useTickets.getState().tickets[0] ?? { id: 1 };
      useTickets.setState({ tickets: [...useTickets.getState().tickets, { ...(t as object), id: 99999, updatedAt: 'x', statusId: 'open' } as never] });
      await vi.advanceTimersByTimeAsync(80);
      await vi.advanceTimersByTimeAsync(10);
      expect(useBoard.getState().data).not.toBe(before);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
