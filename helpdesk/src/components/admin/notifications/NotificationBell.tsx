import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { toast } from '@/store/useUi';
import { useNotifications } from '@/store/useNotifications';
import { errMessage } from '@/lib/apiError';
import { internalPath } from './internalPath';

export interface NotificationBellProps {
  /** Destino do link "Ver todas". */
  allHref?: string;
  /** Recarrega a cada N ms enquanto montado. Padrão: 60 s. 0 desliga. */
  pollMs?: number;
  className?: string;
}

/**
 * Sino de notificações: contador de não lidas e painel com as últimas. Pronto para entrar na barra superior
 * (`<NotificationBell />` no lugar do IconButton "Notificações"). Precisa estar dentro de um Router e, no
 * modo real, de uma sessão aberta.
 */
export function NotificationBell({ allHref = '/admin/notificacoes/central', pollMs = 60_000, className }: NotificationBellProps) {
  const { items, unreadCount, loading, error, refresh, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void refresh();
    if (!pollMs) return undefined;
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const label = unreadCount > 0 ? `Notificações, ${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}` : 'Notificações, nenhuma não lida';

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void refresh();
      }}
    >
      <div className={cn('relative inline-flex', className)}>
        <Popover.Trigger asChild>
          <IconButton label={label} icon={<Bell />} />
        </Popover.Trigger>
        {unreadCount > 0 ? (
          <span aria-hidden className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-2xs font-semibold text-fg-inverse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </div>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} aria-label="Notificações" className="z-50 w-96 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface shadow-menu outline-none">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold text-fg">Notificações</h2>
            <Button
              variant="ghost"
              disabled={unreadCount === 0}
              onClick={() => void markAllRead().catch((e) => toast.error(errMessage(e, 'Não foi possível marcar como lidas.')))}
            >
              Marcar todas como lidas
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error ? (
              <p role="alert" className="px-3 py-4 text-sm text-danger">
                {error}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-fg-muted">{loading ? 'Carregando...' : 'Nenhuma notificação.'}</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const path = internalPath(n.url);
                  const content = (
                    <>
                      <span className="flex items-center gap-2">
                        {n.readAt ? null : <span aria-hidden className="h-2 w-2 shrink-0 rounded-pill bg-action" />}
                        <span className={cn('truncate text-sm', n.readAt ? 'text-fg-muted' : 'font-semibold text-fg')}>{n.title}</span>
                        {n.readAt ? null : <span className="sr-only">(não lida)</span>}
                      </span>
                      {n.body ? <span className="mt-0.5 block truncate text-xs text-fg-muted">{n.body}</span> : null}
                      <span className="mt-0.5 block text-xs text-fg-subtle">{relativeTime(n.createdAt)}</span>
                    </>
                  );
                  const activate = () => {
                    void markRead(n.id).catch(() => undefined);
                    if (path) {
                      setOpen(false);
                      navigate(path);
                    }
                  };
                  return (
                    <li key={n.id} className="border-b border-line last:border-b-0">
                      <button type="button" onClick={activate} className="block w-full px-3 py-2 text-left outline-none hover:bg-hover focus-visible:shadow-focus">
                        {content}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-line px-3 py-2 text-right">
            <Link to={allHref} onClick={() => setOpen(false)} className="rounded-xs text-sm text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
              Ver todas
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
