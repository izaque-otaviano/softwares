import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usersApi } from '@/api';
import { openTicket, openUser } from '@/components/shell/openTab';
import { Avatar, Banner, IconButton, StatusDot, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DEFAULT_STATUSES } from '@/lib/status';
import { relativeTime } from '@/lib/time';
import { toast } from '@/store/useUi';
import { useTickets } from '@/store/useTickets';
import type { User } from '@/types/domain';
import { useFormEntry } from '../formStore';
import { PanelShell, SectionHeader } from './PanelShell';

function localTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date());
  } catch {
    return '—';
  }
}

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1) : code;
  } catch {
    return code;
  }
}

export function CustomerPanel({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const requesterId = entry?.values.requesterId ?? null;
  const tickets = useTickets((s) => s.tickets);
  const storeStatuses = useTickets((s) => s.statuses);
  const statuses = storeStatuses.length ? storeStatuses : DEFAULT_STATUSES;
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState('');
  const [profileOpen, setProfileOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setUser(null);
    setLoadFailed(false);
    if (!requesterId) return;
    let alive = true;
    usersApi
      .getUser(requesterId)
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setNotes(u.notes ?? '');
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [requesterId, attempt]);

  // Se falhar, o texto digitado continua no campo; o toast oferece nova tentativa.
  const saveNotes = () => {
    if (!user || notes === (user.notes ?? '')) return;
    usersApi
      .updateUser(user.id, { notes })
      .then((u) => setUser(u))
      .catch(() => toast.error('Não foi possível salvar as observações.', { action: { label: 'Tentar novamente', onClick: saveNotes } }));
  };

  if (!requesterId) {
    return (
      <PanelShell title="Cliente">
        <p className="p-4 text-sm text-fg-muted">Selecione um solicitante para ver as informações do cliente.</p>
      </PanelShell>
    );
  }

  const history = tickets
    .filter((t) => t.requesterId === requesterId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const currentId = entry?.ticketId ?? null;

  return (
    <PanelShell title="Cliente">
      {!user && loadFailed ? (
        <Banner tone="error" title="Não foi possível carregar o cliente" className="m-4" onRetry={() => setAttempt((n) => n + 1)}>
          Nada do que você digitou no ticket foi perdido.
        </Banner>
      ) : !user ? (
        <p role="status" className="p-4 text-sm text-fg-muted">
          Carregando...
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <section aria-label="Dados do cliente" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={32} decorative />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{user.name}</span>
              <IconButton
                label="Abrir em nova aba"
                size="sm"
                icon={<ExternalLink aria-hidden className="h-4 w-4" />}
                onClick={() => openUser(user.id, user.name)}
              />
            </div>
            <SectionHeader title="Detalhes do cliente" expanded={profileOpen} onToggle={() => setProfileOpen((v) => !v)} />
            {profileOpen ? (
              <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-xs font-semibold text-fg-muted">E-mail</dt>
                <dd className="min-w-0 truncate">
                  <a href={`mailto:${user.email}`} className="text-action hover:underline">
                    {user.email}
                  </a>
                </dd>
                <dt className="text-xs font-semibold text-fg-muted">Hora local</dt>
                <dd>{localTime(user.timezone)}</dd>
                <dt className="text-xs font-semibold text-fg-muted">Idioma</dt>
                <dd>{languageName(user.language)}</dd>
                <dt className="pt-2 text-xs font-semibold text-fg-muted">
                  <label htmlFor={`${ticketKey}-notes`}>Observações</label>
                </dt>
                <dd>
                  <Textarea
                    id={`${ticketKey}-notes`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={saveNotes}
                    placeholder="Adicionar observações"
                    minRows={3}
                  />
                </dd>
              </dl>
            ) : null}
          </section>

          <section aria-label="Histórico de interações" className="flex flex-col gap-2">
            <SectionHeader
              title="Histórico de interações"
              expanded={historyOpen}
              onToggle={() => setHistoryOpen((v) => !v)}
              actions={
                <IconButton
                  label="Atualizar histórico"
                  size="sm"
                  icon={<RefreshCw aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    setNow(new Date());
                    void useTickets.getState().load();
                  }}
                />
              }
            />
            {historyOpen ? (
              history.length === 0 ? (
                <p className="text-sm text-fg-muted">Nenhuma interação ainda.</p>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {history.map((t) => {
                    const st = statuses.find((s) => s.id === t.statusId);
                    const isCurrent = t.id === currentId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-current={isCurrent ? 'true' : undefined}
                          onClick={() => openTicket(t.id)}
                          className={cn(
                            'flex w-full items-start gap-2 rounded px-2 py-2 text-left outline-none transition-colors duration-100 focus-visible:shadow-focus',
                            isCurrent ? 'bg-action-soft' : 'hover:bg-hover',
                          )}
                        >
                          <span className="mt-1">
                            <StatusDot color={st?.color} label={st?.agentName} />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm text-fg">{t.subject}</span>
                            <span className="text-xs text-fg-muted">{relativeTime(t.updatedAt, now)}</span>
                            <span className="text-xs text-fg-muted">Status {st?.agentName ?? '—'}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </section>
        </div>
      )}
    </PanelShell>
  );
}
