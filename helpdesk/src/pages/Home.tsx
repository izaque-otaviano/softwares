import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeRow } from '@/components/lists/HomeRow';
import { useDirectory } from '@/components/lists/useDirectory';
import { openSearch, openTicket } from '@/components/shell/openTab';
import { SecondaryPanel } from '@/components/shell/SecondaryPanel';
import { Banner, Button, EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useNow } from '@/lib/useNow';
import { useTickets } from '@/store/useTickets';
import { ME_ID } from '@/mocks/clock';
import type { Ticket } from '@/types/domain';

type SortMode = 'recommended' | 'recent' | 'oldest';
const SORT_LABEL: Record<SortMode, string> = { recommended: 'Recomendados', recent: 'Mais recentes', oldest: 'Mais antigos' };
const SLA_RANK = { breached: 0, warning: 1, ok: 2, met: 3 } as const;

/** “Recomendados”: SLA mais urgente primeiro, depois a atualização mais recente. */
function recommended(a: Ticket, b: Ticket): number {
  const ra = a.sla ? SLA_RANK[a.sla.state] : 4;
  const rb = b.sla ? SLA_RANK[b.sla.state] : 4;
  if (ra !== rb) return ra - rb;
  if (a.sla && b.sla && ra < 2) return a.sla.dueAt.localeCompare(b.sla.dueAt);
  return b.updatedAt.localeCompare(a.updatedAt);
}

const SETUP_STEPS = ['Conectar e-mail', 'Convidar equipe', 'Criar base de conhecimento', 'Adicionar campo de ticket personalizado', 'Criar macros'];

export default function Home() {
  const tickets = useTickets((s) => s.tickets);
  const statuses = useTickets((s) => s.statuses);
  const loaded = useTickets((s) => s.loaded);
  const loading = useTickets((s) => s.loading);
  const error = useTickets((s) => s.error);
  const users = useDirectory();
  const now = useNow(60_000);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'web_form'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');

  useEffect(() => {
    if (!loaded && !loading && !error) void useTickets.getState().load();
  }, [loaded, loading, error]);

  const mine = useMemo(
    () => tickets.filter((t) => t.assigneeId === ME_ID && statuses.find((s) => s.id === t.statusId)?.category !== 'solved'),
    [tickets, statuses],
  );
  const rows = useMemo(() => {
    const filtered = mine.filter((t) => (statusFilter === 'all' || t.statusId === statusFilter) && (channelFilter === 'all' || t.channel === channelFilter));
    const sorter =
      sortMode === 'recommended'
        ? recommended
        : sortMode === 'recent'
          ? (a: Ticket, b: Ticket) => b.updatedAt.localeCompare(a.updatedAt)
          : (a: Ticket, b: Ticket) => a.updatedAt.localeCompare(b.updatedAt);
    return [...filtered].sort(sorter);
  }, [mine, statusFilter, channelFilter, sortMode]);

  const openCount = mine.length;
  const solvedWeek = useMemo(() => {
    const since = now.getTime() - 7 * 86_400_000;
    return tickets.filter(
      (t) => t.assigneeId === ME_ID && statuses.find((s) => s.id === t.statusId)?.category === 'solved' && new Date(t.updatedAt).getTime() >= since,
    ).length;
  }, [tickets, statuses, now]);

  const isLoading = !loaded && !error;
  const statusLabel = statusFilter === 'all' ? 'Status' : (statuses.find((s) => s.id === statusFilter)?.agentName ?? 'Status');
  const channelLabel = channelFilter === 'all' ? 'Canal' : channelFilter === 'email' ? 'E-mail' : 'Formulário web';

  return (
    <div className="flex h-full min-h-0 w-full">
      <SecondaryPanel pageKey="home" width={240} title="Começar agora">
        <nav aria-label="Seções" className="flex flex-col gap-1 px-2 pb-3">
          <NavGroup title="Seu trabalho">
            <NavItem active>Tickets</NavItem>
          </NavGroup>
          <NavGroup title="Trabalho compartilhado" divider>
            <NavItem>Em cópia (CC)</NavItem>
            <NavItem>Seguindo</NavItem>
          </NavGroup>
          <NavGroup title="Trabalho concluído" divider>
            <NavItem>Últimos 30 dias</NavItem>
          </NavGroup>
        </nav>
      </SecondaryPanel>

      <main className="flex min-w-0 flex-1 flex-col bg-surface-1" aria-label="Tickets">
        <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          <section className="min-w-0 flex-1 self-start rounded border border-line bg-surface" aria-label="Seus tickets">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h1 className="mr-2 text-md font-semibold text-fg">
                {isLoading ? 'Tickets' : `${rows.length} ${rows.length === 1 ? 'ticket' : 'tickets'}`}
              </h1>
              <FilterMenu label={statusLabel}>
                <MenuItem onSelect={() => setStatusFilter('all')}>Todos os status</MenuItem>
                {statuses.map((s) => (
                  <MenuItem key={s.id} onSelect={() => setStatusFilter(s.id)}>
                    {s.agentName}
                  </MenuItem>
                ))}
              </FilterMenu>
              <FilterMenu label={channelLabel}>
                <MenuItem onSelect={() => setChannelFilter('all')}>Todos os canais</MenuItem>
                <MenuItem onSelect={() => setChannelFilter('email')}>E-mail</MenuItem>
                <MenuItem onSelect={() => setChannelFilter('web_form')}>Formulário web</MenuItem>
              </FilterMenu>
              <div className="ml-auto">
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" trailingIcon={<ArrowUpDown />}>
                      {SORT_LABEL[sortMode]}
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                      <MenuItem key={m} checked={m === sortMode} onSelect={() => setSortMode(m)}>
                        {SORT_LABEL[m]}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              </div>
            </div>

            {error && !loaded ? (
              <div className="p-4">
                <Banner tone="error" title="Não foi possível carregar os tickets." onRetry={() => void useTickets.getState().load()}>
                  Verifique sua conexão e tente novamente.
                </Banner>
              </div>
            ) : isLoading ? (
              <ul role="status" aria-label="Carregando tickets" className="m-0 list-none p-0">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-start gap-3 border-b border-line px-4 py-3">
                    <Skeleton circle width={32} height={32} />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton width="55%" />
                      <Skeleton width="80%" />
                      <Skeleton width="20%" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : rows.length === 0 ? (
              <EmptyState
                illustration="box"
                title="Nenhum ticket por aqui"
                description={mine.length === 0 ? 'Você não tem tickets abertos atribuídos a você.' : 'Nenhum ticket corresponde aos filtros escolhidos.'}
                action={
                  mine.length > 0 ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStatusFilter('all');
                        setChannelFilter('all');
                      }}
                    >
                      Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="m-0 list-none p-0" aria-label="Lista de tickets">
                {rows.map((t) => (
                  <HomeRow
                    key={t.id}
                    ticket={t}
                    status={statuses.find((s) => s.id === t.statusId)}
                    requester={users.get(t.requesterId)}
                    now={now}
                    onOpen={(x) => openTicket(x.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside aria-label="Widgets" className="flex w-[235px] shrink-0 flex-col gap-4 self-start">
            <Widget title="Guia de configuração">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {SETUP_STEPS.map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">{s}</span>
                    <Link to="/admin" className="shrink-0 text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                      Iniciar
                    </Link>
                  </li>
                ))}
              </ul>
            </Widget>
            <Widget title="Estatísticas do ticket">
              <p className="text-xs text-fg-muted">Esta semana</p>
              <p className="mt-1 text-sm">
                Resolvido <span className="font-semibold">{isLoading ? '-' : solvedWeek}</span>
              </p>
            </Widget>
            <Widget title="Tickets abertos">
              <p className="text-xs text-fg-muted">Seus grupos</p>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => openSearch('status:aberto')}
                aria-label={`${openCount} tickets abertos`}
                className="mt-1 rounded text-2xl text-action hover:text-action-hover hover:underline focus-visible:shadow-focus focus-visible:outline-none disabled:text-fg-subtle"
              >
                {isLoading ? '-' : openCount}
              </button>
            </Widget>
            <Widget title="Atualizações">
              <p className="text-sm text-fg-muted">Sem atualizações recentes.</p>
            </Widget>
          </aside>
        </div>
      </main>
    </div>
  );
}

function NavGroup({ title, divider, children }: { title: string; divider?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-0.5', divider && 'mt-2 border-t border-line pt-3')}>
      <p className="px-2 pb-1 text-xs font-semibold text-fg-muted">{title}</p>
      {children}
    </div>
  );
}

function NavItem({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-8 w-full items-center rounded px-2 text-left text-sm outline-none transition-colors duration-100 focus-visible:shadow-focus',
        active ? 'bg-ink-active text-fg-inverse' : 'text-fg hover:bg-hover',
      )}
    >
      {children}
    </button>
  );
}

function FilterMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="outline" trailingIcon={<ChevronDown />}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  );
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-line bg-surface p-4" aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}
