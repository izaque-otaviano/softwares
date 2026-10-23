import type { AuditLogEntry, AuditLogFilters, PageOf, TicketAccessEntry, TicketAccessFilters } from '@/types/admin-b';
import { ApiError } from '../errors';
import { simulate } from './delay';

/** Dados de exemplo (mock): nomes e resumos fictícios. */
const ACTORS = [
  { id: '1', name: 'Alice Admin' },
  { id: '2', name: 'Sofia Supervisora' },
  { id: '3', name: 'Bruno Agente' },
];
const SAMPLES: { action: string; target: string; summary: string; changes: Record<string, unknown> }[] = [
  { action: 'config_change', target: 'usuário', summary: 'Senha redefinida por um administrador', changes: {} },
  { action: 'update', target: 'ticket', summary: 'Prioridade alterada', changes: { prioridade: ['Normal', 'Alta'] } },
  { action: 'status_change', target: 'ticket', summary: 'Status alterado para Resolvido', changes: { status: ['Aberto', 'Resolvido'] } },
  { action: 'assign', target: 'ticket', summary: 'Ticket atribuído a Bruno Agente', changes: { responsável: ['Ninguém', 'Bruno Agente'] } },
  { action: 'create', target: 'macro', summary: 'Macro "Boas-vindas" criada', changes: {} },
  { action: 'export', target: 'pedido LGPD', summary: 'Download do pacote LGPD', changes: {} },
  { action: 'login', target: 'usuário', summary: 'Entrada no sistema', changes: {} },
  { action: 'delete', target: 'gatilho', summary: 'Gatilho "Escalonar urgentes" removido', changes: {} },
];

const baseTime = Date.parse('2026-10-22T18:00:00-03:00');
const logs: AuditLogEntry[] = Array.from({ length: 57 }, (_, i) => {
  const s = SAMPLES[i % SAMPLES.length]!;
  const a = ACTORS[i % ACTORS.length]!;
  return {
    id: String(57 - i),
    actorId: a.id,
    actorName: a.name,
    action: s.action,
    targetLabel: s.target,
    objectId: String(100 + i),
    summary: s.summary,
    changes: s.changes,
    createdAt: new Date(baseTime - i * 3_600_000 * 3).toISOString(),
  };
});

const access: TicketAccessEntry[] = Array.from({ length: 31 }, (_, i) => {
  const a = ACTORS[i % ACTORS.length]!;
  return {
    id: String(31 - i),
    ticketId: String(6 + (i % 5)),
    ticketReference: `TD-${String(6 + (i % 5)).padStart(5, '0')}`,
    team: i % 2 ? 'Financeiro' : 'Jurídico',
    userId: a.id,
    userName: a.name,
    granted: i % 4 !== 3,
    context: ['detail', 'export', 'api', 'kanban'][i % 4]!,
    createdAt: new Date(baseTime - i * 3_600_000 * 5).toISOString(),
  };
});

function paginate<T>(rows: T[], f: { limit?: number; offset?: number }): PageOf<T> {
  const limit = f.limit ?? 25;
  const offset = f.offset ?? 0;
  return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

export function listAuditLogs(f: AuditLogFilters = {}): Promise<PageOf<AuditLogEntry>> {
  return simulate(() =>
    paginate(
      logs.filter((l) => (!f.action || l.action === f.action) && (!f.actor || l.actorId === f.actor) && (!f.from || l.createdAt.slice(0, 10) >= f.from)),
      f,
    ),
  );
}

export function getAuditLog(id: string): Promise<AuditLogEntry> {
  return simulate(() => {
    const found = logs.find((l) => l.id === id);
    if (!found) throw new ApiError('Não encontrado.', { status: 404 });
    return found;
  });
}

export function listTicketAccess(f: TicketAccessFilters = {}): Promise<PageOf<TicketAccessEntry>> {
  return simulate(() =>
    paginate(
      access.filter((a) => (!f.ticket || a.ticketId === f.ticket) && (!f.user || a.userId === f.user) && (!f.deniedOnly || !a.granted)),
      f,
    ),
  );
}

export function getTicketAccess(id: string): Promise<TicketAccessEntry> {
  return simulate(() => {
    const found = access.find((a) => a.id === id);
    if (!found) throw new ApiError('Não encontrado.', { status: 404 });
    return found;
  });
}
