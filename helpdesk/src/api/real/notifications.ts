import type { NotificationItem, NotificationPrefs, PageOf, PageQuery } from '@/types/admin-b';
import { http } from './http';
import { mapNotification, mapPage, mapPrefs, type NotificationDto, type NotificationPrefsDto, type PaginatedDto } from './mappers/adminB';

/**
 * NOTIFICAÇÕES do próprio usuário. `/notification-preferences/` (GET/PUT: `in_app` e `email` por tipo; o PUT só
 * mescla as chaves enviadas) e `/notifications/` (lista paginada com `unread_count`, `?unread=1`),
 * `/notifications/{id}/read/` e `/notifications/read-all/`.
 */
export async function getPreferences(): Promise<NotificationPrefs> {
  return mapPrefs(await http.get<NotificationPrefsDto>('/notification-preferences/'));
}

export async function savePreferences(next: Pick<NotificationPrefs, 'inApp' | 'email'>): Promise<NotificationPrefs> {
  return mapPrefs(await http.put<NotificationPrefsDto>('/notification-preferences/', { in_app: next.inApp, email: next.email }));
}

export async function listNotifications(f: PageQuery & { unreadOnly?: boolean } = {}): Promise<PageOf<NotificationItem>> {
  const q = { limit: f.limit ?? 25, offset: f.offset ?? 0 };
  return mapPage(await http.get<PaginatedDto<NotificationDto>>('/notifications/', { ...q, unread: f.unreadOnly ? 1 : undefined }), mapNotification, q);
}

export async function markNotificationRead(id: string): Promise<{ markedRead: number }> {
  const dto = await http.post<{ marked_read: number }>(`/notifications/${encodeURIComponent(id)}/read/`, {});
  return { markedRead: dto?.marked_read ?? 0 };
}

export async function markAllNotificationsRead(): Promise<{ markedRead: number }> {
  const dto = await http.post<{ marked_read: number }>('/notifications/read-all/', {});
  return { markedRead: dto?.marked_read ?? 0 };
}
