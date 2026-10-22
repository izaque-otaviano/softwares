import { Building2, Search, Ticket as TicketIcon, User as UserIcon, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { recentViewed, search, type RecentItem } from '@/api/search';
import { Avatar, IconButton, Skeleton, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/time';
import { useTickets } from '@/store/useTickets';
import type { SearchResults } from '@/types/domain';
import { openOrg, openSearch, openTicket, openUser } from './openTab';
import { useSearchUi } from './searchState';

type Chip = 'tickets' | 'articles' | 'users' | 'orgs' | 'chats';
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'articles', label: 'Artigos' },
  { id: 'users', label: 'Usuários' },
  { id: 'orgs', label: 'Organizações' },
  { id: 'chats', label: 'Conversas paralelas' },
];

const MAX_PER_GROUP = 5;
export const SEARCH_DEBOUNCE_MS = 200;

interface Row {
  key: string;
  node: ReactNode;
  open: () => void;
}

const rowClass = (active: boolean) =>
  cn('flex min-h-8 w-full items-center gap-2 rounded-xs px-2 py-1 text-left text-sm outline-none', active ? 'bg-hover' : 'hover:bg-hover');

/** Botão (lupa) + campo de 420px sobre as abas + popover com recentes e resultados (brief 5.2). */
export function GlobalSearch() {
  const open = useSearchUi((s) => s.open);
  const setOpen = useSearchUi((s) => s.setOpen);
  const statuses = useTickets((s) => s.statuses);
  const [term, setTerm] = useState('');
  const [chip, setChip] = useState<Chip | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trimmed = term.trim();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Recentes ao abrir.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    recentViewed(8).then((r) => alive && setRecent(r), () => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  // Busca com debounce de 200 ms.
  useEffect(() => {
    if (!open || !trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    const timer = setTimeout(() => {
      search(trimmed).then(
        (r) => {
          if (!alive) return;
          setResults(r);
          setLoading(false);
        },
        () => {
          if (!alive) return;
          setResults({ tickets: [], users: [], orgs: [] });
          setLoading(false);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, trimmed]);

  // Clique fora fecha.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, setOpen]);

  useEffect(() => setCursor(-1), [trimmed, chip, results]);

  const finish = (fn: () => void) => () => {
    fn();
    setOpen(false);
    setTerm('');
    setChip(null);
  };

  const sections = useMemo(() => {
    const out: { id: Chip | 'recent'; title: string; rows: Row[]; empty?: string }[] = [];
    if (!trimmed) {
      out.push({
        id: 'recent',
        title: 'Visualizações recentes',
        empty: 'Nada visualizado ainda.',
        rows: recent.map((r) => ({
          key: `${r.kind}:${r.id}`,
          open: finish(() => (r.kind === 'ticket' ? openTicket(r.id, { title: r.title }) : r.kind === 'user' ? openUser(r.id, r.title) : openOrg(r.id, r.title))),
          node: (
            <>
              {r.kind === 'ticket' ? <TicketIcon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" /> : r.kind === 'user' ? <UserIcon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" /> : <Building2 aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />}
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-xs text-fg-muted">
                {r.meta} | {relativeTime(r.at)}
              </span>
            </>
          ),
        })),
      });
      return out;
    }
    const show = (c: Chip) => chip === null || chip === c;
    const data = results ?? { tickets: [], users: [], orgs: [] };
    if (show('tickets'))
      out.push({
        id: 'tickets',
        title: 'Tickets',
        rows: data.tickets.slice(0, MAX_PER_GROUP).map((t) => ({
          key: `t${t.id}`,
          open: finish(() => openTicket(t.id, { title: t.subject, channel: t.channel })),
          node: (
            <>
              <StatusBadge status={statuses.find((s) => s.id === t.statusId)} label={statuses.length ? undefined : t.statusId} compact />
              <span className="min-w-0 flex-1 truncate">{t.subject}</span>
              <span className="shrink-0 text-xs text-fg-muted">#{t.id}</span>
            </>
          ),
        })),
      });
    if (show('articles')) out.push({ id: 'articles', title: 'Artigos', rows: [], empty: 'Nenhum artigo nesta versão.' });
    if (show('users'))
      out.push({
        id: 'users',
        title: 'Usuários',
        rows: data.users.slice(0, MAX_PER_GROUP).map((u) => ({
          key: `u${u.id}`,
          open: finish(() => openUser(u.id, u.name)),
          node: (
            <>
              <Avatar name={u.name} size={20} decorative />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="min-w-0 truncate text-xs text-fg-muted">{u.email}</span>
            </>
          ),
        })),
      });
    if (show('orgs'))
      out.push({
        id: 'orgs',
        title: 'Organizações',
        rows: data.orgs.slice(0, MAX_PER_GROUP).map((o) => ({
          key: `o${o.id}`,
          open: finish(() => openOrg(o.id, o.name)),
          node: (
            <>
              <Building2 aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
            </>
          ),
        })),
      });
    if (show('chats')) out.push({ id: 'chats', title: 'Conversas paralelas', rows: [], empty: 'Nenhuma conversa paralela nesta versão.' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, chip, results, recent, statuses]);

  const flat = sections.flatMap((s) => s.rows);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c <= 0 ? flat.length - 1 : c - 1) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = flat[cursor];
      if (row) row.open();
      else if (trimmed) finish(() => openSearch(trimmed))();
    }
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        label="Pesquisar"
        shortcut="/"
        icon={<Search />}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      />
      {open ? (
        <div ref={wrapRef} className="absolute left-48 top-1 z-40 w-[420px] max-w-[calc(100vw-1rem)]">
          <div className="flex h-8 items-center gap-2 rounded border border-action bg-surface px-2 shadow-focus">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
            <input
              autoFocus
              role="combobox"
              aria-label="Pesquisar"
              aria-expanded
              aria-controls="global-search-panel"
              aria-autocomplete="list"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pesquisar tickets, usuários e organizações"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
            {term ? (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                onClick={() => setTerm('')}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div
            id="global-search-panel"
            className="mt-1 max-h-[70vh] overflow-y-auto rounded border border-line bg-surface p-2 shadow-menu"
          >
            <div className="flex flex-wrap gap-1 pb-2">
              {CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={chip === c.id}
                  onClick={() => setChip(chip === c.id ? null : c.id)}
                  className={cn(
                    'h-6 rounded-pill border px-2 text-xs outline-none focus-visible:shadow-focus',
                    chip === c.id ? 'border-ink-active bg-ink-active text-fg-inverse' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {loading && trimmed ? (
              <div role="status" aria-label="Pesquisando" className="flex flex-col gap-2 px-2 py-2">
                <Skeleton width="70%" />
                <Skeleton width="50%" />
                <Skeleton width="60%" />
              </div>
            ) : (
              sections.map((s) => (
                <section key={s.id} aria-label={s.title} className="pb-1">
                  <h3 className="px-2 py-1 text-xs font-semibold text-fg-muted">{s.title}</h3>
                  {s.rows.length === 0 ? <p className="px-2 py-1 text-xs text-fg-muted">{s.empty ?? 'Nenhum resultado.'}</p> : null}
                  {s.rows.map((r) => {
                    const idx = flat.indexOf(r);
                    return (
                      <button key={r.key} type="button" onClick={r.open} className={rowClass(idx === cursor)}>
                        {r.node}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
            {trimmed ? (
              <button
                type="button"
                onClick={finish(() => openSearch(trimmed))}
                className="mt-1 flex h-8 w-full items-center justify-between rounded-xs border-t border-line px-2 text-sm text-action outline-none hover:bg-hover"
              >
                <span>Todos os resultados da pesquisa</span>
                <kbd className="font-sans text-xs text-fg-muted">Enter</kbd>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
