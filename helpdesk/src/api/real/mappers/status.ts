import type { StatusCategory, TicketStatus } from '@/types/domain';
import type { StatusDto } from './dto';

/** Categoria do Resolv -> categoria do Helpdesk (`pending_customer` = Pendente, `closed` = Resolvido). */
export function mapCategory(category: string | null | undefined): StatusCategory {
  switch (category) {
    case 'new':
      return 'new';
    case 'pending_customer':
    case 'pending':
      return 'pending';
    case 'closed':
    case 'solved':
      return 'solved';
    default:
      return 'open';
  }
}

/** Categoria do Helpdesk -> categoria do Resolv (filtro `?status=` do GET /tickets/). */
export function toBackendCategory(category: StatusCategory): string {
  return category === 'pending' ? 'pending_customer' : category === 'solved' ? 'closed' : category;
}

/**
 * Stage do Resolv -> TicketStatus. `id` é `String(id)`; `category` vem da categoria do stage; `color` é o hex do stage
 * (o StatusBadge aceita cor CSS literal). O backend não tem `endUserName` nem descrição: usa o nome e deixa a descrição vazia.
 */
export function mapStatus(dto: StatusDto): TicketStatus {
  return {
    id: String(dto.id),
    category: mapCategory(dto.category),
    agentName: dto.name,
    agentDescription: '',
    endUserName: dto.name,
    color: dto.color,
    active: dto.is_active,
    system: dto.is_system,
  };
}

/** Stage de fábrica de uma categoria (o de sistema, senão o primeiro ativo). */
export function factoryStatusFor(statuses: TicketStatus[], category: StatusCategory): TicketStatus | undefined {
  return statuses.find((s) => s.system && s.category === category) ?? statuses.find((s) => s.category === category && s.active !== false) ?? statuses.find((s) => s.category === category);
}

/**
 * `statusId` do ticket = o stage do backend. Se o stage for nulo (ticket antigo) OU contradisser a categoria `status`
 * (o backend reabre sem trocar o stage: ticket reaberto continua com o stage "Fechado"), usa o stage de fábrica da
 * categoria `status`, porque é a categoria que o servidor usa em filtros, visões e contadores.
 */
export function resolveStatusId(ticket: { status: string; stage: number | null }, statuses: TicketStatus[]): string {
  const category = mapCategory(ticket.status);
  const stage = ticket.stage == null ? undefined : statuses.find((s) => s.id === String(ticket.stage));
  if (stage && stage.category === category) return stage.id;
  return factoryStatusFor(statuses, category)?.id ?? (ticket.stage == null ? category : String(ticket.stage));
}
