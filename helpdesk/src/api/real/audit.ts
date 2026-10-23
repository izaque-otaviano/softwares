import type { AuditLogEntry, AuditLogFilters, PageOf, TicketAccessEntry, TicketAccessFilters } from '@/types/admin-b';
import { http } from './http';
import { mapAuditLog, mapPage, mapTicketAccess, type AuditLogDto, type PaginatedDto, type TicketAccessDto } from './mappers/adminB';

/**
 * AUDITORIA (somente leitura, só administrador): `/audit/logs/` (filtros action, actor, from) e
 * `/audit/ticket-access/` (filtros ticket, user, denied=1). Paginação do servidor (limit/offset).
 * O backend não tem filtro "até", busca por texto nem exportação: a tela não finge ter.
 */
const PAGE = 25;

export async function listAuditLogs(f: AuditLogFilters = {}): Promise<PageOf<AuditLogEntry>> {
  const q = { limit: f.limit ?? PAGE, offset: f.offset ?? 0 };
  const dto = await http.get<PaginatedDto<AuditLogDto>>('/audit/logs/', { ...q, action: f.action, actor: f.actor, from: f.from });
  return mapPage(dto, mapAuditLog, q);
}

export async function getAuditLog(id: string): Promise<AuditLogEntry> {
  return mapAuditLog(await http.get<AuditLogDto>(`/audit/logs/${encodeURIComponent(id)}/`));
}

export async function listTicketAccess(f: TicketAccessFilters = {}): Promise<PageOf<TicketAccessEntry>> {
  const q = { limit: f.limit ?? PAGE, offset: f.offset ?? 0 };
  const dto = await http.get<PaginatedDto<TicketAccessDto>>('/audit/ticket-access/', { ...q, ticket: f.ticket, user: f.user, denied: f.deniedOnly ? 1 : undefined });
  return mapPage(dto, mapTicketAccess, q);
}

export async function getTicketAccess(id: string): Promise<TicketAccessEntry> {
  return mapTicketAccess(await http.get<TicketAccessDto>(`/audit/ticket-access/${encodeURIComponent(id)}/`));
}
