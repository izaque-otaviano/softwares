import type { StatusCategory, TicketStatus } from '@/types/domain';

export const CATEGORY_DESCRIPTION: Record<StatusCategory, string> = {
  new: 'Tickets que ainda não foram vistos ou atendidos por um agente.',
  open: 'Tickets em atendimento, aguardando ação da equipe.',
  pending: 'Tickets aguardando retorno do solicitante ou de terceiros.',
  solved: 'Tickets com o problema resolvido; o cliente ainda pode reabrir.',
};

/** Cores de status disponíveis (tokens `status.*`), com nome para o seletor. */
export const STATUS_COLOR_OPTIONS = [
  { value: 'new', label: 'Laranja' },
  { value: 'open', label: 'Vermelho' },
  { value: 'hold', label: 'Vinho' },
  { value: 'pending', label: 'Azul' },
  { value: 'solved', label: 'Cinza escuro' },
];

export const DEFAULT_COLOR_BY_CATEGORY: Record<StatusCategory, string> = { new: 'new', open: 'open', pending: 'pending', solved: 'solved' };

/** Status de sistema (um por categoria) não podem ser desativados. */
export const SYSTEM_STATUS_IDS = ['new', 'open', 'pending', 'solved'];

export const isActive = (s: TicketStatus): boolean => s.active !== false;
