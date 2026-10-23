import type { NotificationItem, NotificationPrefs, PageOf, PageQuery } from '@/types/admin-b';
import { simulate } from './delay';

const KINDS = [
  ['ticket_created', 'Ticket novo'],
  ['ticket_assigned', 'Ticket atribuído'],
  ['ticket_owner_set', 'Dono técnico definido'],
  ['ticket_replied', 'Ticket respondido'],
  ['ticket_reopened', 'Ticket reaberto'],
  ['ticket_closed', 'Ticket encerrado'],
  ['mention', 'Menção'],
  ['sla_warning', 'SLA próximo do limite'],
  ['sla_breached', 'SLA estourado'],
  ['chat_incoming', 'Chat na fila'],
  ['chat_converted', 'Chat virou ticket'],
  ['chat_closed', 'Chat encerrado'],
  ['announcement', 'Aviso'],
  ['attachment_blocked', 'Anexo bloqueado'],
  ['lgpd_deadline', 'Prazo de pedido LGPD'],
  ['kanban_due', 'Prazo do quadro vencido'],
] as const;

const allOn = () => Object.fromEntries(KINDS.map(([k]) => [k, true]));
let prefs: NotificationPrefs = { kinds: KINDS.map(([value, label]) => ({ value, label })), inApp: allOn(), email: allOn() };

const hour = 3_600_000;
const now = Date.parse('2026-10-23T09:00:00-03:00');
let items: NotificationItem[] = [
  { id: '5', kind: 'sla_warning', title: 'SLA próximo do limite: TD-00012', body: 'Faltam 30 minutos para a primeira resposta.', url: '/tickets/12', ticketId: '12', createdAt: new Date(now - hour).toISOString() },
  { id: '4', kind: 'mention', title: 'Você foi mencionado em TD-00020', body: 'Bruno Agente: @você pode revisar?', url: '/tickets/20', ticketId: '20', actorName: 'Bruno Agente', createdAt: new Date(now - 3 * hour).toISOString() },
  { id: '3', kind: 'ticket_assigned', title: 'Ticket atribuído a você: TD-00024', body: 'Dúvida sobre fatura', url: '/tickets/24', ticketId: '24', actorName: 'Sofia Supervisora', createdAt: new Date(now - 20 * hour).toISOString() },
  { id: '2', kind: 'announcement', title: 'Manutenção programada', body: 'Sábado, 02:00.', url: '', createdAt: new Date(now - 50 * hour).toISOString(), readAt: new Date(now - 40 * hour).toISOString() },
  { id: '1', kind: 'lgpd_deadline', title: 'Prazo de pedido LGPD', body: 'Pedido #1 vence em 2 dias.', url: '/admin/lgpd', createdAt: new Date(now - 90 * hour).toISOString(), readAt: new Date(now - 80 * hour).toISOString() },
];

const unread = () => items.filter((i) => !i.readAt).length;

export function getPreferences(): Promise<NotificationPrefs> {
  return simulate(() => structuredClone(prefs));
}

export function savePreferences(next: Pick<NotificationPrefs, 'inApp' | 'email'>): Promise<NotificationPrefs> {
  return simulate(() => {
    prefs = { ...prefs, inApp: { ...prefs.inApp, ...next.inApp }, email: { ...prefs.email, ...next.email } };
    return structuredClone(prefs);
  });
}

export function listNotifications(f: PageQuery & { unreadOnly?: boolean } = {}): Promise<PageOf<NotificationItem>> {
  return simulate(() => {
    const limit = f.limit ?? 25;
    const offset = f.offset ?? 0;
    const rows = f.unreadOnly ? items.filter((i) => !i.readAt) : items;
    return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset, unreadCount: unread() };
  });
}

export function markNotificationRead(id: string): Promise<{ markedRead: number }> {
  return simulate(() => {
    const found = items.find((i) => i.id === id && !i.readAt);
    items = items.map((i) => (i.id === id && !i.readAt ? { ...i, readAt: new Date().toISOString() } : i));
    return { markedRead: found ? 1 : 0 };
  });
}

export function markAllNotificationsRead(): Promise<{ markedRead: number }> {
  return simulate(() => {
    const n = unread();
    items = items.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() }));
    return { markedRead: n };
  });
}
