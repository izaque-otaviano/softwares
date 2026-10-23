import { ApiError } from '@/api/errors';
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

/** Status de fábrica (`is_system` no backend; no mock, os quatro ids de sistema). */
export const isFactory = (s: Pick<TicketStatus, 'id' | 'system'>): boolean => s.system ?? SYSTEM_STATUS_IDS.includes(s.id);

export const FACTORY_NOTE = 'Status de fábrica: não pode ser desativado nem mudar de categoria.';

/** Por que a categoria de um status existente não pode mudar (`undefined` = pode). Espelha as regras do backend. */
export function categoryLockReason(s: Pick<TicketStatus, 'id' | 'system' | 'ticketCount'> | null): string | undefined {
  if (!s) return undefined;
  if (isFactory(s)) return FACTORY_NOTE;
  if ((s.ticketCount ?? 0) > 0) {
    const n = s.ticketCount!;
    return `${n} ${n === 1 ? 'ticket usa' : 'tickets usam'} este status, então a categoria não pode mudar. Crie um status na categoria certa e mova os tickets para ele.`;
  }
  return undefined;
}

export interface StatusFormErrors {
  /** Erros por campo do formulário (mensagem do backend, em pt-BR). */
  fields: { agentName?: string; category?: string; color?: string };
  /** Mensagem que não pertence a um campo (permissão, regra geral, falha de rede). */
  general?: string;
}

/**
 * Erros de `POST/PATCH /settings/statuses/` -> campos do formulário. O backend responde 400 com `{campo:[mensagem]}`:
 * `name` (nome repetido), `category` (troca de categoria recusada), `is_active` (status de fábrica não desativa) e
 * `color`. O nome do status para o agente é o `name` do backend. Nada do que foi digitado é perdido.
 */
export function statusFormErrors(e: unknown): StatusFormErrors {
  if (!(e instanceof ApiError)) return { fields: {}, general: e instanceof Error && e.message ? e.message : 'Não foi possível salvar. Tente novamente.' };
  const first = (k: string) => e.fieldErrors?.[k]?.[0];
  const fields: StatusFormErrors['fields'] = { agentName: first('name'), category: first('category'), color: first('color') };
  const hasField = Boolean(fields.agentName || fields.category || fields.color);
  const general = first('is_active') ?? (hasField ? undefined : e.message);
  return { fields, general };
}
