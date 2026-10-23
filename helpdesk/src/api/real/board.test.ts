import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/board-cards.json';
import boards from './__fixtures__/board-list.json';
import { ApiError } from '../errors';
import * as board from './board';

type Handler = (method: string, path: string, body: unknown) => { status: number; body?: unknown };
let calls: { method: string; path: string; body: unknown }[] = [];
let handler: Handler;

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  handler = () => ({ status: 200, body: fixture });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = String(url).replace(/^.*\/api\/v1/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init.method ?? 'GET', path, body });
      const r = handler(init.method ?? 'GET', path, body);
      return json(r.status, r.body);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('API real do quadro', () => {
  it('lista os quadros (envelope paginado)', async () => {
    handler = () => ({ status: 200, body: boards });
    expect(await board.listBoards()).toEqual([{ id: 1, name: 'Suporte · semana', slug: 'suporte-semana', teamId: 1, teamSlug: 'suporte' }]);
    expect(calls[0]!.path).toMatch(/^\/kanban\/boards\/\?limit=/);
  });

  it('carrega o quadro montado em uma chamada', async () => {
    const data = await board.getBoard(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/kanban/boards/1/cards/' });
    expect(data.columns.length).toBeGreaterThan(3);
    expect(data.cards.length).toBe(3);
  });

  it('mover para status envia stage_id; para coluna de organização envia lane_id', async () => {
    await board.placeCard(1, 176, { kind: 'stage', stageId: 2 });
    await board.placeCard(1, 176, { kind: 'lane', laneId: 3 });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/kanban/boards/1/place/', body: { ticket_id: 176, stage_id: 2 } });
    expect(calls[1]!.body).toEqual({ ticket_id: 176, lane_id: 3 });
  });

  it('409 de coluna de conclusão vira ApiError com o código e a frase do backend', async () => {
    handler = () => ({ status: 409, body: { detail: 'Mover para esta coluna fecha o ticket: conclua o fechamento antes.', code: 'close_dialog_required' } });
    const err = await board.placeCard(1, 176, { kind: 'stage', stageId: 4 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'close_dialog_required' });
  });

  it('403 usa a frase padrão de permissão; 404 e 400 chegam com o status', async () => {
    handler = () => ({ status: 403, body: { detail: 'Kanban é área interna.' } });
    await expect(board.getBoard(1)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Você não tem permissão') });
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    await expect(board.placeCard(1, 9, { kind: 'stage', stageId: 2 })).rejects.toMatchObject({ status: 404 });
    handler = () => ({ status: 400, body: { stage_id: ['Status não encontrado.'] } });
    await expect(board.placeCard(1, 9, { kind: 'stage', stageId: 99 })).rejects.toMatchObject({ status: 400, message: 'Status não encontrado.' });
  });

  it('prazo interno: PATCH entry com data ou null', async () => {
    await board.setCardDue(1, 177, '2026-10-30T18:00:00.000Z');
    await board.setCardDue(1, 177, null);
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/kanban/boards/1/entry/177/', body: { due_at: '2026-10-30T18:00:00.000Z' } });
    expect(calls[1]!.body).toEqual({ due_at: null });
  });

  it('limite de WIP: PATCH columns/{chave} (chave de coluna de organização inclui o prefixo)', async () => {
    await board.setWipLimit(1, 'lane-3', 5);
    await board.setWipLimit(1, '2', null);
    expect(calls[0]).toMatchObject({ path: '/kanban/boards/1/columns/lane-3/', body: { wip_limit: 5 } });
    expect(calls[1]).toMatchObject({ path: '/kanban/boards/1/columns/2/', body: { wip_limit: null } });
  });

  it('quadros: criar, renomear e excluir (administrador); 403 para quem não é', async () => {
    handler = (m) => ({ status: m === 'POST' ? 201 : m === 'DELETE' ? 204 : 200, body: m === 'DELETE' ? undefined : boards.results[0] });
    await board.createBoard('  AG-board novo ');
    await board.renameBoard(1, ' Outro ');
    await board.deleteBoard(1);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /kanban/boards/', 'PATCH /kanban/boards/1/', 'DELETE /kanban/boards/1/']);
    expect(calls[0]!.body).toEqual({ name: 'AG-board novo' });
    handler = () => ({ status: 403, body: { detail: 'Apenas administradores configuram quadros.' } });
    await expect(board.createBoard('x')).rejects.toMatchObject({ status: 403 });
  });

  it('colunas de organização: criar, renomear, reordenar (order = posição) e excluir', async () => {
    handler = (m) => ({ status: m === 'DELETE' ? 204 : 200, body: m === 'DELETE' ? undefined : {} });
    await board.createLane(1, ' AG-board lane ');
    await board.renameLane(3, 'Nova');
    await board.reorderLanes([7, 3, 5]);
    await board.deleteLane(3);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/kanban/lanes/', body: { board: 1, name: 'AG-board lane' } });
    expect(calls[1]).toMatchObject({ method: 'PATCH', path: '/kanban/lanes/3/', body: { name: 'Nova' } });
    expect(calls.slice(2, 5).map((c) => [c.path, c.body])).toEqual([
      ['/kanban/lanes/7/', { order: 0 }],
      ['/kanban/lanes/3/', { order: 1 }],
      ['/kanban/lanes/5/', { order: 2 }],
    ]);
    expect(calls[5]).toMatchObject({ method: 'DELETE', path: '/kanban/lanes/3/' });
  });

  it('nome de coluna repetido: 400 com a mensagem do backend', async () => {
    handler = () => ({ status: 400, body: { non_field_errors: ['Os campos board, name devem criar um conjunto único.'] } });
    await expect(board.createLane(1, 'Igual')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('conjunto único') });
  });
});
