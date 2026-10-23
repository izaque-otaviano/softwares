import type { BoardCard, BoardColumn, BoardData, BoardSummary } from '@/types/board';
import type { SlaClockDto } from './dto';
import { mapCategory } from './status';
import { mapPriority, mapSla } from './ticket';

/** Quadro (`BoardSerializer`). */
export interface BoardDto {
  id: number;
  name: string;
  slug: string;
  team: number | null;
  team_slug: string | null;
  is_active?: boolean;
}

/** Coluna de organização (`BoardLaneSerializer`). */
export interface BoardLaneDto {
  id: number;
  board: number;
  name: string;
  order: number;
  wip_limit: number | null;
}

export interface BoardColumnDto {
  key: string;
  name: string;
  color: string;
  category: string | null;
  kind: 'stage' | 'lane' | string;
  stage: number | null;
  lane: number | null;
  concludes: boolean;
  wip_limit: number | null;
}

export interface BoardEntryDto {
  ticket: number;
  ticket_reference: string;
  ticket_status: string;
  stage: number | null;
  priority: string;
  subject: string;
  requester_display: string;
  company_name: string | null;
  team_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  sla?: { first_response?: SlaClockDto; resolution?: SlaClockDto };
  column: string;
  message_count: number;
  attachment_count: number;
  due_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface BoardViewDto {
  columns: BoardColumnDto[];
  entries: BoardEntryDto[];
}

export function mapBoardSummary(dto: BoardDto): BoardSummary {
  return {
    id: dto.id,
    name: dto.name,
    slug: dto.slug,
    teamId: dto.team ?? undefined,
    teamSlug: dto.team_slug ?? undefined,
  };
}

export function mapBoardColumn(dto: BoardColumnDto): BoardColumn {
  const lane = dto.kind === 'lane';
  return {
    key: dto.key,
    name: dto.name,
    kind: lane ? 'lane' : 'stage',
    // A cor da coluna de organização é cinza literal do backend: o front usa o estilo neutro dele.
    color: lane ? undefined : dto.color,
    category: lane ? undefined : mapCategory(dto.category),
    stageId: dto.stage ?? undefined,
    laneId: dto.lane ?? undefined,
    concludes: dto.concludes,
    wipLimit: dto.wip_limit ?? null,
  };
}

export function mapBoardCard(dto: BoardEntryDto): BoardCard {
  return {
    ticketId: dto.ticket,
    reference: dto.ticket_reference,
    subject: dto.subject,
    requesterName: dto.requester_display,
    companyName: dto.company_name ?? undefined,
    teamName: dto.team_name ?? undefined,
    priority: mapPriority(dto.priority),
    stageKey: dto.stage != null ? String(dto.stage) : null,
    columnKey: dto.column,
    category: mapCategory(dto.ticket_status),
    assigneeId: dto.assignee_id != null ? String(dto.assignee_id) : undefined,
    assigneeName: dto.assignee_name ?? undefined,
    assigneeAvatar: dto.assignee_avatar ?? undefined,
    sla: mapSla(dto.sla),
    dueAt: dto.due_at ?? undefined,
    overdue: dto.is_overdue,
    messageCount: dto.message_count,
    attachmentCount: dto.attachment_count,
    createdAt: dto.created_at,
  };
}

/** Quadro montado (`GET boards/{id}/cards/` e as respostas de `place/`, `entry/` e `columns/`). */
export function mapBoardView(dto: BoardViewDto): BoardData {
  return { columns: dto.columns.map(mapBoardColumn), cards: dto.entries.map(mapBoardCard) };
}
