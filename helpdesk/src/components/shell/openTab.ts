import { getOrg } from '@/api/orgs';
import { getTicket } from '@/api/tickets';
import { getUser } from '@/api/users';
import { useTabs, type OpenTabInput, type TabKind, type WorkTab } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';

type Navigate = (to: string) => void;
let navigateFn: Navigate | null = null;

/** O AgentLayout registra o `navigate` do router para que telas e utilitários naveguem fora de componentes. */
export function registerNavigate(fn: Navigate | null): void {
  navigateFn = fn;
}

export function goTo(path: string): void {
  if (navigateFn) navigateFn(path);
  else if (typeof window !== 'undefined') window.history.pushState({}, '', path);
}

/** Rota correspondente a uma aba. */
export function tabPath(tab: Pick<WorkTab, 'kind' | 'refId'>): string {
  switch (tab.kind) {
    case 'ticket':
      return `/agent/tickets/${tab.refId}`;
    case 'user':
      return `/agent/customers/${tab.refId}`;
    case 'org':
      return `/agent/orgs/${tab.refId}`;
    case 'search':
      return `/agent/search?q=${encodeURIComponent(tab.refId)}`;
    case 'new-ticket':
      return '/agent/tickets/new';
  }
}

/** Rota → aba (usado para abrir a aba certa quando a URL é aberta direto). `null` = rota sem aba. */
export function parseTabRoute(pathname: string, search: string): OpenTabInput | null {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/agent/tickets/new') return { kind: 'new-ticket', title: 'Novo ticket' };
  const m = /^\/agent\/(tickets|customers|orgs)\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[2]!);
    if (m[1] === 'tickets') return { kind: 'ticket', refId: id, title: ticketTitle(id) };
    if (m[1] === 'customers') return { kind: 'user', refId: id, title: 'Usuário' };
    return { kind: 'org', refId: id, title: 'Organização' };
  }
  if (path === '/agent/search') {
    const q = new URLSearchParams(search).get('q')?.trim();
    if (q) return { kind: 'search', refId: q, title: `Pesquisar ${q}` };
  }
  return null;
}

function ticketTitle(id: string | number): string {
  const t = useTickets.getState().tickets.find((x) => String(x.id) === String(id));
  return t?.subject ?? `Ticket #${id}`;
}

async function resolveMeta(tabId: string, kind: TabKind, refId: string, hasTitle: boolean): Promise<void> {
  const { updateTab } = useTabs.getState();
  try {
    if (kind === 'ticket') {
      const t = await getTicket(Number(refId));
      const requester = await getUser(t.requesterId).catch(() => null);
      useTabs.setState((s) => ({
        tabs: s.tabs.map((x) =>
          x.id === tabId ? { ...x, title: hasTitle ? x.title : t.subject, subtitle: requester?.name ?? x.subtitle, channel: t.channel } : x,
        ),
        recent: s.recent.map((r) => (r.ticketId === t.id ? { ...r, title: t.subject, requesterName: requester?.name ?? r.requesterName } : r)),
      }));
    } else if (kind === 'user') {
      const u = await getUser(refId);
      updateTab(tabId, { title: u.name, subtitle: u.email });
    } else if (kind === 'org') {
      const o = await getOrg(refId);
      updateTab(tabId, { title: o.name, subtitle: 'Organização' });
    }
  } catch {
    /* mantém o título provisório */
  }
}

/** Abre (ou foca) a aba e completa título/solicitante em segundo plano quando a aba é nova. */
export function ensureTab(input: OpenTabInput, hasTitle = false): string {
  const refId = String(input.refId ?? '');
  const key = `${input.kind}:${refId}`;
  const existed = input.kind !== 'new-ticket' && useTabs.getState().tabs.some((t) => t.id === key);
  const id = useTabs.getState().openTab(input);
  if (!existed && (input.kind === 'ticket' || input.kind === 'user' || input.kind === 'org')) {
    void resolveMeta(id, input.kind, refId, hasTitle);
  }
  return id;
}

/** Abre/foca a aba do ticket e navega para ele. */
export function openTicket(id: number | string, hint: { title?: string; requesterName?: string; channel?: 'email' | 'web_form' } = {}): void {
  const t = useTickets.getState().tickets.find((x) => String(x.id) === String(id));
  ensureTab(
    { kind: 'ticket', refId: id, title: hint.title ?? t?.subject ?? `Ticket #${id}`, subtitle: hint.requesterName, channel: hint.channel ?? t?.channel },
    Boolean(hint.title ?? t),
  );
  goTo(`/agent/tickets/${id}`);
}

export function openUser(id: string, name?: string): void {
  ensureTab({ kind: 'user', refId: id, title: name ?? 'Usuário' }, Boolean(name));
  goTo(`/agent/customers/${id}`);
}

export function openOrg(id: string, name?: string): void {
  ensureTab({ kind: 'org', refId: id, title: name ?? 'Organização' }, Boolean(name));
  goTo(`/agent/orgs/${id}`);
}

export function openSearch(term: string): void {
  const q = term.trim();
  if (!q) return;
  ensureTab({ kind: 'search', refId: q, title: `Pesquisar ${q}` });
  goTo(tabPath({ kind: 'search', refId: q }));
}

export function openNewTicket(): void {
  ensureTab({ kind: 'new-ticket', title: 'Novo ticket' });
  goTo('/agent/tickets/new');
}

/** Foca uma aba existente e navega para a rota dela. */
export function activateTab(id: string): void {
  const tab = useTabs.getState().tabs.find((t) => t.id === id);
  if (!tab) return;
  useTabs.getState().setActive(id);
  goTo(tabPath(tab));
}
