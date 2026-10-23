import { create } from 'zustand';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/notifications';
import { errMessage } from '@/lib/apiError';
import type { NotificationItem } from '@/types/admin-b';

interface NotificationsState {
  /** Últimas notificações (para o sino). */
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | undefined;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

const LATEST = 10;
const initial = { items: [] as NotificationItem[], unreadCount: 0, loading: false, error: undefined as string | undefined };

/** Estado do sino: últimas notificações e o contador de não lidas do servidor. A central completa pagina por conta própria. */
export const useNotifications = create<NotificationsState>()((set, get) => ({
  ...initial,
  refresh: async () => {
    set({ loading: true, error: undefined });
    try {
      const page = await listNotifications({ limit: LATEST });
      set({ items: page.items, unreadCount: page.unreadCount ?? page.items.filter((i) => !i.readAt).length, loading: false });
    } catch (e) {
      set({ loading: false, error: errMessage(e, 'Não foi possível carregar as notificações.') });
    }
  },
  markRead: async (id) => {
    const target = get().items.find((i) => i.id === id);
    if (target && !target.readAt) {
      // Otimista: o servidor confirma em seguida; se falhar, volta ao estado anterior.
      set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i)), unreadCount: Math.max(0, s.unreadCount - 1) }));
    }
    try {
      await markNotificationRead(id);
    } catch (e) {
      await get().refresh();
      throw e;
    }
  },
  markAllRead: async () => {
    await markAllNotificationsRead();
    set((s) => ({ items: s.items.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })), unreadCount: 0 }));
  },
  reset: () => set({ ...initial }),
}));
