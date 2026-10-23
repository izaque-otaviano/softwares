import type { BoardData, BoardSummary, PlaceTarget } from '@/types/board';
import { http } from './http';
import { mapBoardSummary, mapBoardView, type BoardDto, type BoardLaneDto, type BoardViewDto } from './mappers/board';
import { listAll } from './refs';

/**
 * QUADRO: `/kanban/boards/` e `/kanban/lanes/`. O quadro é uma VISTA dos tickets não resolvidos (cada um na coluna do seu
 * status): `cards/` devolve colunas e cartões numa resposta só, e `place/`, `entry/` e `columns/{chave}/` devolvem o quadro
 * inteiro de novo. Configurar quadro é de administrador; mover cartão, prazo, limite e colunas de organização são de qualquer
 * interno. O backend NÃO guarda ordem dentro da coluna nem "adicionar ticket ao quadro" (ver o store).
 */
const base = (boardId: number) => `/kanban/boards/${boardId}`;

export async function listBoards(): Promise<BoardSummary[]> {
  return (await listAll<BoardDto>('/kanban/boards/')).map(mapBoardSummary);
}

export async function getBoard(boardId: number): Promise<BoardData> {
  return mapBoardView(await http.get<BoardViewDto>(`${base(boardId)}/cards/`));
}

export async function placeCard(boardId: number, ticketId: number, target: PlaceTarget): Promise<BoardData> {
  const body = target.kind === 'stage' ? { ticket_id: ticketId, stage_id: target.stageId } : { ticket_id: ticketId, lane_id: target.laneId };
  return mapBoardView(await http.post<BoardViewDto>(`${base(boardId)}/place/`, body));
}

/** Prazo interno do cartão (ISO) ou `null` para tirar. */
export async function setCardDue(boardId: number, ticketId: number, dueAt: string | null): Promise<BoardData> {
  return mapBoardView(await http.patch<BoardViewDto>(`${base(boardId)}/entry/${ticketId}/`, { due_at: dueAt }));
}

export async function setWipLimit(boardId: number, columnKey: string, limit: number | null): Promise<BoardData> {
  return mapBoardView(await http.patch<BoardViewDto>(`${base(boardId)}/columns/${encodeURIComponent(columnKey)}/`, { wip_limit: limit }));
}

export async function createBoard(name: string, teamId?: number): Promise<BoardSummary> {
  return mapBoardSummary(await http.post<BoardDto>('/kanban/boards/', { name: name.trim(), ...(teamId ? { team: teamId } : {}) }));
}

export async function renameBoard(boardId: number, name: string): Promise<BoardSummary> {
  return mapBoardSummary(await http.patch<BoardDto>(`${base(boardId)}/`, { name: name.trim() }));
}

export async function deleteBoard(boardId: number): Promise<void> {
  await http.delete(`${base(boardId)}/`);
}

export async function createLane(boardId: number, name: string): Promise<void> {
  await http.post<BoardLaneDto>('/kanban/lanes/', { board: boardId, name: name.trim() });
}

export async function renameLane(laneId: number, name: string): Promise<void> {
  await http.patch<BoardLaneDto>(`/kanban/lanes/${laneId}/`, { name: name.trim() });
}

/** Grava a ordem das colunas de organização: `order` = posição na lista recebida. */
export async function reorderLanes(laneIds: number[]): Promise<void> {
  for (const [order, id] of laneIds.entries()) await http.patch<BoardLaneDto>(`/kanban/lanes/${id}/`, { order });
}

/** Os cartões fixados na coluna voltam às colunas de status (o backend os solta); nenhum ticket é apagado. */
export async function deleteLane(laneId: number): Promise<void> {
  await http.delete(`/kanban/lanes/${laneId}/`);
}
