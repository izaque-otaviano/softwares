import type { BoardCard, BoardColumn, BoardData, BoardSummary, PlaceTarget } from '@/types/board';
import type { Ticket, TicketStatus } from '@/types/domain';
import { ApiError } from '../errors';
import { db } from './db';
import { simulate } from './delay';

/**
 * Quadro no modo mock: uma vista dos tickets não resolvidos do "banco" em memória, igual ao backend. Colunas de status
 * (soltar muda o status), colunas de organização (só fixam), prazo interno e limite de WIP ficam aqui, em memória.
 */
interface MockLane {
  id: number;
  boardId: number;
  name: string;
  order: number;
  wipLimit: number | null;
}
interface MockCard {
  laneId?: number;
  dueAt?: string;
}
interface MockState {
  boards: BoardSummary[];
  lanes: MockLane[];
  cards: Map<string, MockCard>;
  stageLimits: Map<string, number>;
  seq: number;
  seeded: boolean;
}

const fresh = (): MockState => ({
  boards: [
    { id: 1, name: 'Suporte · semana', slug: 'suporte-semana' },
    { id: 2, name: 'Triagem geral', slug: 'triagem-geral' },
  ],
  lanes: [],
  cards: new Map(),
  stageLimits: new Map(),
  seq: 10,
  seeded: false,
});

let state = fresh();

/** Só para testes. */
export function resetBoardMock(): void {
  state = fresh();
}

const ck = (boardId: number, ticketId: number) => `${boardId}:${ticketId}`;
const stageKeyOf = (statuses: TicketStatus[], statusId: string): string | null => {
  const i = statuses.findIndex((s) => s.id === statusId);
  return i < 0 ? null : String(i + 1);
};
const isOpen = (t: Ticket, statuses: TicketStatus[]): boolean => statuses.find((s) => s.id === t.statusId)?.category !== 'solved';

function seed(): void {
  if (state.seeded) return;
  state.seeded = true;
  state.lanes.push({ id: 1, boardId: 1, name: 'Depende do gestor', order: 0, wipLimit: 3 }, { id: 2, boardId: 1, name: 'Sprint desta semana', order: 1, wipLimit: null });
  const open = db.tickets.filter((t) => isOpen(t, db.statuses)).sort((a, b) => a.id - b.id);
  const day = 86_400_000;
  open.forEach((t, i) => {
    if (i % 6 === 0) state.cards.set(ck(1, t.id), { dueAt: new Date(Date.now() + (i % 12 === 0 ? -2 : 3) * day).toISOString() });
    if (i % 9 === 4) state.cards.set(ck(1, t.id), { ...state.cards.get(ck(1, t.id)), laneId: i % 2 ? 1 : 2 });
  });
}

function assemble(boardId: number): BoardData {
  seed();
  const statuses = db.statuses;
  const lanes = state.lanes.filter((l) => l.boardId === boardId).sort((a, b) => a.order - b.order || a.id - b.id);
  const columns: BoardColumn[] = [
    ...statuses.map<BoardColumn>((s, i) => ({
      key: String(i + 1),
      name: s.agentName,
      kind: 'stage',
      color: s.color,
      category: s.category,
      stageId: i + 1,
      concludes: s.category === 'solved',
      wipLimit: state.stageLimits.get(`${boardId}:${i + 1}`) ?? null,
    })),
    ...lanes.map<BoardColumn>((l) => ({ key: `lane-${l.id}`, name: l.name, kind: 'lane', laneId: l.id, concludes: false, wipLimit: l.wipLimit })),
  ];
  const laneIds = new Set(lanes.map((l) => l.id));
  const now = Date.now();
  const cards = db.tickets
    .filter((t) => isOpen(t, statuses))
    .map<BoardCard>((t) => {
      const extra = state.cards.get(ck(boardId, t.id));
      const stageKey = stageKeyOf(statuses, t.statusId);
      const pinned = extra?.laneId && laneIds.has(extra.laneId) ? extra.laneId : undefined;
      const requester = db.users.find((u) => u.id === t.requesterId);
      const assignee = t.assigneeId ? db.users.find((u) => u.id === t.assigneeId) : undefined;
      return {
        ticketId: t.id,
        reference: t.reference ?? `TD-${String(t.id).padStart(5, '0')}`,
        subject: t.subject,
        requesterName: requester?.name ?? t.requesterName ?? 'Solicitante',
        companyName: (requester?.orgId ? db.orgs.find((o) => o.id === requester.orgId)?.name : undefined) ?? t.companyName,
        teamName: db.groups.find((g) => g.id === t.assigneeGroupId)?.name,
        priority: t.priority ?? 'normal',
        stageKey,
        columnKey: pinned ? `lane-${pinned}` : (stageKey ?? '1'),
        category: statuses.find((s) => s.id === t.statusId)?.category ?? 'open',
        assigneeId: t.assigneeId,
        assigneeName: assignee?.name,
        assigneeAvatar: assignee?.avatarUrl ?? undefined,
        sla: t.sla,
        dueAt: extra?.dueAt,
        overdue: Boolean(extra?.dueAt && Date.parse(extra.dueAt) < now),
        messageCount: t.comments.length,
        attachmentCount: t.comments.reduce((n, c) => n + c.attachments.length, 0),
        createdAt: t.createdAt,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { columns, cards };
}

const need = <T>(v: T | undefined, msg: string): T => {
  if (v === undefined) throw new ApiError(msg, { status: 404 });
  return v;
};
const boardOf = (id: number) => need(state.boards.find((b) => b.id === id), 'Quadro não encontrado.');

export const listBoards = (): Promise<BoardSummary[]> => simulate(() => state.boards.map((b) => ({ ...b })), { critical: true });

export const getBoard = (boardId: number): Promise<BoardData> =>
  simulate(() => {
    boardOf(boardId);
    return assemble(boardId);
  }, { critical: true });

export function placeCard(boardId: number, ticketId: number, target: PlaceTarget): Promise<BoardData> {
  return simulate(() => {
    boardOf(boardId);
    seed();
    const i = db.tickets.findIndex((t) => t.id === ticketId && isOpen(t, db.statuses));
    if (i < 0) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const key = ck(boardId, ticketId);
    if (target.kind === 'lane') {
      if (!state.lanes.some((l) => l.id === target.laneId && l.boardId === boardId)) throw new ApiError('Coluna não encontrada neste quadro.', { status: 400 });
      state.cards.set(key, { ...state.cards.get(key), laneId: target.laneId });
    } else {
      const status = db.statuses[target.stageId - 1];
      if (!status) throw new ApiError('Status não encontrado.', { status: 400 });
      if (status.category === 'solved') {
        throw new ApiError('Mover para esta coluna fecha o ticket: conclua o fechamento (datas de solução) antes.', { status: 409, code: 'close_dialog_required' });
      }
      db.tickets[i] = { ...db.tickets[i]!, statusId: status.id, updatedAt: new Date().toISOString() };
      const prev = state.cards.get(key);
      if (prev?.dueAt) state.cards.set(key, { dueAt: prev.dueAt });
      else state.cards.delete(key);
    }
    return assemble(boardId);
  });
}

export function setCardDue(boardId: number, ticketId: number, dueAt: string | null): Promise<BoardData> {
  return simulate(() => {
    boardOf(boardId);
    seed();
    if (!db.tickets.some((t) => t.id === ticketId)) throw new ApiError('Ticket não encontrado.', { status: 404 });
    const key = ck(boardId, ticketId);
    const prev = state.cards.get(key) ?? {};
    const next = { ...prev, dueAt: dueAt ?? undefined };
    if (!next.dueAt && !next.laneId) state.cards.delete(key);
    else state.cards.set(key, next);
    return assemble(boardId);
  });
}

export function setWipLimit(boardId: number, columnKey: string, limit: number | null): Promise<BoardData> {
  return simulate(() => {
    boardOf(boardId);
    seed();
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 999)) throw new ApiError('O limite precisa ser um número de 1 a 999.', { status: 400 });
    if (columnKey.startsWith('lane-')) {
      const lane = need(state.lanes.find((l) => `lane-${l.id}` === columnKey && l.boardId === boardId), 'Coluna não encontrada neste quadro.');
      lane.wipLimit = limit;
    } else {
      const status = need(db.statuses[Number(columnKey) - 1], 'Coluna não encontrada neste quadro.');
      if (status.category === 'solved') throw new ApiError('A coluna de conclusão fica sempre vazia e não aceita limite.', { status: 400 });
      const k = `${boardId}:${columnKey}`;
      if (limit === null) state.stageLimits.delete(k);
      else state.stageLimits.set(k, limit);
    }
    return assemble(boardId);
  });
}

export function createBoard(name: string, teamId?: number): Promise<BoardSummary> {
  return simulate(() => {
    const clean = name.trim();
    if (!clean) throw new ApiError('Informe o nome do quadro.', { status: 400 });
    const board: BoardSummary = { id: ++state.seq, name: clean, slug: clean.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quadro', teamId };
    state.boards.push(board);
    return { ...board };
  });
}

export function renameBoard(boardId: number, name: string): Promise<BoardSummary> {
  return simulate(() => {
    const board = boardOf(boardId);
    if (!name.trim()) throw new ApiError('Informe o nome do quadro.', { status: 400 });
    board.name = name.trim();
    return { ...board };
  });
}

export function deleteBoard(boardId: number): Promise<void> {
  return simulate(() => {
    boardOf(boardId);
    state.boards = state.boards.filter((b) => b.id !== boardId);
    state.lanes = state.lanes.filter((l) => l.boardId !== boardId);
  });
}

export function createLane(boardId: number, name: string): Promise<void> {
  return simulate(() => {
    boardOf(boardId);
    seed();
    const clean = name.trim();
    if (!clean) throw new ApiError('Informe o nome da coluna.', { status: 400 });
    if (state.lanes.some((l) => l.boardId === boardId && l.name.toLowerCase() === clean.toLowerCase())) {
      throw new ApiError('Já existe uma coluna com este nome neste quadro.', { status: 400 });
    }
    const last = Math.max(-1, ...state.lanes.filter((l) => l.boardId === boardId).map((l) => l.order));
    state.lanes.push({ id: ++state.seq, boardId, name: clean, order: last + 1, wipLimit: null });
  });
}

export function renameLane(laneId: number, name: string): Promise<void> {
  return simulate(() => {
    const lane = need(state.lanes.find((l) => l.id === laneId), 'Coluna não encontrada.');
    const clean = name.trim();
    if (!clean) throw new ApiError('Informe o nome da coluna.', { status: 400 });
    if (state.lanes.some((l) => l.id !== laneId && l.boardId === lane.boardId && l.name.toLowerCase() === clean.toLowerCase())) {
      throw new ApiError('Já existe uma coluna com este nome neste quadro.', { status: 400 });
    }
    lane.name = clean;
  });
}

export function reorderLanes(laneIds: number[]): Promise<void> {
  return simulate(() => {
    laneIds.forEach((id, order) => {
      const lane = state.lanes.find((l) => l.id === id);
      if (lane) lane.order = order;
    });
  });
}

export function deleteLane(laneId: number): Promise<void> {
  return simulate(() => {
    need(state.lanes.find((l) => l.id === laneId), 'Coluna não encontrada.');
    state.lanes = state.lanes.filter((l) => l.id !== laneId);
    for (const [k, c] of state.cards) if (c.laneId === laneId) (c.dueAt ? state.cards.set(k, { dueAt: c.dueAt }) : state.cards.delete(k));
  });
}
