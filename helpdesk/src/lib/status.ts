import type { Priority, StatusCategory, TicketStatus, TicketType } from '@/types/domain';

/** Chaves de cor de status que existem como token (`status.*` no Tailwind e `--status-*` no CSS). */
export const STATUS_COLOR_KEYS = ['new', 'open', 'hold', 'pending', 'solved'] as const;
export type StatusColorKey = (typeof STATUS_COLOR_KEYS)[number];

export function isStatusColorKey(value: string): value is StatusColorKey {
  return (STATUS_COLOR_KEYS as readonly string[]).includes(value);
}

/** Tom forte de cada chave, o mesmo que o backend guarda: serve para achar a chave de uma cor vinda do servidor. */
const STRONG_HEX: Record<StatusColorKey, string> = { new: '#855800', open: '#A12620', hold: '#394B80', pending: '#465365', solved: '#216338' };

/** Chave de token de uma cor de status: a própria chave, ou a chave cujo tom forte é esse hex (cor de fábrica do backend). */
export function statusColorKey(color: string): StatusColorKey | undefined {
  if (isStatusColorKey(color)) return color;
  const hex = color.trim().toUpperCase();
  return STATUS_COLOR_KEYS.find((k) => STRONG_HEX[k] === hex);
}

/** Cor CSS forte de um status (bolinha, faixa, cabeçalho de coluna): token para as chaves conhecidas, valor literal nos demais. */
export function statusColor(color: string): string {
  const key = statusColorKey(color);
  return key ? `var(--status-${key})` : color;
}

/** Fundo suave do selo: o tom claro do token, ou um tom claro derivado da cor de um status personalizado. */
export function statusSoftColor(color: string): string {
  const key = statusColorKey(color);
  return key ? `var(--status-soft-${key})` : `color-mix(in srgb, ${color} 14%, white)`;
}

/** Cor do texto do selo: o tom forte do token, ou a cor personalizada escurecida para manter o contraste. */
export function statusInkColor(color: string): string {
  const key = statusColorKey(color);
  return key ? `var(--status-${key})` : `color-mix(in srgb, ${color} 55%, black)`;
}

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  new: 'Novo',
  open: 'Aberto',
  pending: 'Pendente',
  solved: 'Resolvido',
};

/** Ordem de exibição das categorias (agrupamento e menu de envio). */
export const CATEGORY_ORDER: StatusCategory[] = ['new', 'open', 'pending', 'solved'];

export const DEFAULT_STATUSES: TicketStatus[] = [
  { id: 'new', category: 'new', agentName: 'Novo', agentDescription: 'Ticket recém-criado, ainda sem resposta.', endUserName: 'Novo', color: 'new' },
  { id: 'open', category: 'open', agentName: 'Aberto', agentDescription: 'Ticket atribuído e aguardando ação do agente.', endUserName: 'Aberto', color: 'open' },
  { id: 'in_progress', category: 'open', agentName: 'Em andamento', agentDescription: 'O agente está trabalhando no ticket.', endUserName: 'Em andamento', color: 'hold' },
  { id: 'pending', category: 'pending', agentName: 'Pendente', agentDescription: 'Aguardando retorno do solicitante.', endUserName: 'Aguardando resposta', color: 'pending' },
  { id: 'solved', category: 'solved', agentName: 'Resolvido', agentDescription: 'Problema resolvido; o ticket pode ser reaberto pelo cliente.', endUserName: 'Resolvido', color: 'solved' },
];

/** Id do status de uma categoria (o de sistema; senão o primeiro ativo). No backend real os ids são numéricos: nunca use 'solved'/'new' literais. */
export function statusIdByCategory(statuses: TicketStatus[], category: StatusCategory, fallback: string = category): string {
  return (statuses.find((s) => s.category === category && s.system) ?? statuses.find((s) => s.category === category && s.active !== false) ?? statuses.find((s) => s.category === category))?.id ?? fallback;
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const TYPE_LABEL: Record<TicketType, string> = {
  question: 'Pergunta',
  incident: 'Incidente',
  problem: 'Problema',
  task: 'Tarefa',
};
