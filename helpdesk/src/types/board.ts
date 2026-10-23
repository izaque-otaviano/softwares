import type { Priority, StatusCategory, TicketSla } from './domain';

/** Quadro (kanban) listado no seletor. */
export interface BoardSummary {
  id: number;
  name: string;
  slug: string;
  /** Equipe que recorta o quadro (ausente = quadro geral). */
  teamId?: number;
  teamSlug?: string;
}

/**
 * Coluna do quadro. Duas espécies:
 * - `stage`: é um status; soltar um cartão aqui MUDA o status do ticket.
 * - `lane`: coluna de organização do quadro; soltar aqui só fixa o cartão (o status não muda).
 */
export interface BoardColumn {
  /** Chave estável: `"3"` (status) ou `"lane-9"` (organização). */
  key: string;
  name: string;
  kind: 'stage' | 'lane';
  /** Cor do status (token ou valor do status personalizado). Ausente nas colunas de organização. */
  color?: string;
  category?: StatusCategory;
  stageId?: number;
  laneId?: number;
  /** Coluna de conclusão: fica sempre vazia, o ticket fecha pelo fluxo de fechamento. */
  concludes: boolean;
  /** Limite de trabalho em andamento (só avisa, não bloqueia). */
  wipLimit: number | null;
}

export interface BoardCard {
  ticketId: number;
  reference: string;
  subject: string;
  requesterName: string;
  companyName?: string;
  teamName?: string;
  priority: Priority;
  /** Coluna de status real do ticket (a faixa do cartão usa a cor dela, mesmo dentro de uma coluna de organização). */
  stageKey: string | null;
  /** Coluna onde o cartão aparece agora. */
  columnKey: string;
  category: StatusCategory;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  sla?: TicketSla;
  /** Prazo interno do quadro (ISO). */
  dueAt?: string;
  overdue: boolean;
  messageCount: number;
  attachmentCount: number;
  createdAt: string;
}

export interface BoardData {
  columns: BoardColumn[];
  cards: BoardCard[];
}

export type PlaceTarget = { kind: 'stage'; stageId: number } | { kind: 'lane'; laneId: number };

export interface BoardFilters {
  query: string;
  /** `''` = todos; `'none'` = sem responsável; senão o id do responsável. */
  assignee: string;
  /** `''` = todas. */
  priority: '' | Priority;
  /** `''` = todas; senão o nome da empresa. */
  company: string;
  overdueOnly: boolean;
}

export const EMPTY_BOARD_FILTERS: BoardFilters = { query: '', assignee: '', priority: '', company: '', overdueOnly: false };
