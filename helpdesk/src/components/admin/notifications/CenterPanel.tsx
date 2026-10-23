import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/notifications';
import { Pager } from '@/components/admin/audit/Pager';
import { usePaged } from '@/components/admin/audit/usePaged';
import { Banner, Button, EmptyState, Skeleton } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { absoluteTime } from '@/lib/time';
import { useNotifications } from '@/store/useNotifications';
import { toast } from '@/store/useUi';
import type { NotificationItem } from '@/types/admin-b';
import { internalPath } from './internalPath';

const PAGE = 20;

/** Central de notificações do usuário: lista com filtro de não lidas, marcar uma ou todas como lidas. */
export function CenterPanel() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const navigate = useNavigate();
  const { page, loading, error, offset, setOffset, reload } = usePaged((o) => listNotifications({ limit: PAGE, offset: o, unreadOnly }), String(unreadOnly));
  const refreshBell = useNotifications((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const unread = page?.unreadCount ?? 0;

  const after = () => {
    reload();
    void refreshBell();
  };

  const read = async (n: NotificationItem) => {
    try {
      if (!n.readAt) await markNotificationRead(n.id);
      after();
      const path = internalPath(n.url);
      if (path) navigate(path);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível marcar como lida.'));
    }
  };

  const readAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      toast.success('Tudo marcado como lido');
      after();
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível marcar como lidas.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-8 items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-4 w-4" />
          Somente não lidas {page ? `(${unread})` : ''}
        </label>
        <Button variant="outline" disabled={unread === 0 || busy} loading={busy} onClick={() => void readAll()}>
          Marcar todas como lidas
        </Button>
      </div>
      {loading && !page ? (
        <Skeleton height={120} />
      ) : error && !page ? (
        <Banner tone="error" onRetry={reload}>
          {error}
        </Banner>
      ) : page && page.items.length === 0 ? (
        <EmptyState illustration="box" title={unreadOnly ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'} description="Quando algo precisar da sua atenção, aparece aqui." />
      ) : (
        <ul aria-label="Notificações" className="divide-y divide-line rounded border border-line">
          {page?.items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-3 py-2.5">
              <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-pill', n.readAt ? 'bg-transparent' : 'bg-action')} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', n.readAt ? 'text-fg-muted' : 'font-semibold text-fg')}>
                  {n.title}
                  {n.readAt ? null : <span className="sr-only"> (não lida)</span>}
                </p>
                {n.body ? <p className="text-sm text-fg-muted">{n.body}</p> : null}
                <p className="text-xs text-fg-subtle">
                  {absoluteTime(n.createdAt)}
                  {n.actorName ? ` · ${n.actorName}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {internalPath(n.url) ? (
                  <Button variant="ghost" onClick={() => void read(n)} aria-label={`Abrir ${n.title}`}>
                    Abrir
                  </Button>
                ) : null}
                {n.readAt ? null : (
                  <Button
                    variant="ghost"
                    aria-label={`Marcar como lida: ${n.title}`}
                    onClick={() =>
                      void markNotificationRead(n.id)
                        .then(after)
                        .catch((e) => toast.error(errMessage(e, 'Não foi possível marcar como lida.')))
                    }
                  >
                    Marcar como lida
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {page ? <Pager total={page.total} limit={page.limit} offset={offset} onOffset={setOffset} loading={loading} label="Paginação das notificações" /> : null}
    </div>
  );
}
