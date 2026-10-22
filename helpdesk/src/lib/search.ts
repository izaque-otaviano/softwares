import { DEFAULT_STATUSES } from '@/lib/status';
import type { Org, Priority, SearchResults, Ticket, TicketStatus, User } from '@/types/domain';

/** Minúsculas e sem acentos. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface SearchData {
  tickets: Ticket[];
  users: User[];
  orgs: Org[];
  /** Necessário para `status:`; sem ele vale o conjunto padrão. */
  statuses?: TicketStatus[];
}

export interface ParsedQuery {
  /** Texto livre (sem os operadores), já normalizado. */
  text: string;
  status: string[];
  priority: string[];
  assignee: string[];
}

const OPERATORS: Record<string, 'status' | 'priority' | 'assignee'> = {
  status: 'status',
  priority: 'priority',
  prioridade: 'priority',
  assignee: 'assignee',
  atribuido: 'assignee',
};

const PRIORITY_ALIASES: Record<string, Priority> = {
  low: 'low', baixa: 'low', normal: 'normal', high: 'high', alta: 'high', urgent: 'urgent', urgente: 'urgent',
};

/** Separa operadores (`status:aberto`, `priority:alta`, `assignee:me`) do texto livre. */
export function parseQuery(term: string): ParsedQuery {
  const out: ParsedQuery = { text: '', status: [], priority: [], assignee: [] };
  const free: string[] = [];
  for (const token of term.trim().split(/\s+/)) {
    const m = /^([a-zA-ZÀ-ÿ]+):(.+)$/.exec(token);
    const op = m ? OPERATORS[normalize(m[1]!)] : undefined;
    if (m && op) out[op].push(normalize(m[2]!));
    else if (token) free.push(token);
  }
  out.text = normalize(free.join(' '));
  return out;
}

function matchesStatus(t: Ticket, values: string[], statuses: TicketStatus[]): boolean {
  const st = statuses.find((s) => s.id === t.statusId);
  const names = [t.statusId, st?.category, st?.agentName, st?.endUserName].filter(Boolean).map((x) => normalize(String(x)));
  const aliases: Record<string, string> = { aberto: 'open', aberta: 'open', novo: 'new', pendente: 'pending', resolvido: 'solved', solucionado: 'solved' };
  return values.some((v) => names.includes(normalize(aliases[v] ?? v)) || names.includes(v));
}

/**
 * Busca por assunto, `#id` (ou número puro), nome e e-mail (parcial) do solicitante, usuários e organizações.
 * Operadores: `status:aberto|novo|pendente|resolvido`, `priority:alta`, `assignee:me`. Com operador, só tickets.
 * Resultados agrupados por tipo; tickets mais recentes primeiro.
 */
export function searchAll(term: string, data: SearchData, meId = 'me'): SearchResults {
  const parsed = parseQuery(term);
  const hasOps = parsed.status.length + parsed.priority.length + parsed.assignee.length > 0;
  const q = parsed.text;
  if (!q && !hasOps) return { tickets: [], users: [], orgs: [] };
  const statuses = data.statuses?.length ? data.statuses : DEFAULT_STATUSES;
  const idQuery = /^#?\d+$/.test(q) ? q.replace('#', '') : null;
  const byId = new Map(data.users.map((u) => [u.id, u]));

  const tickets = data.tickets
    .filter((t) => {
      if (parsed.status.length && !matchesStatus(t, parsed.status, statuses)) return false;
      if (parsed.priority.length && !parsed.priority.some((p) => PRIORITY_ALIASES[p] === t.priority)) return false;
      if (parsed.assignee.length) {
        const assignee = t.assigneeId ? byId.get(t.assigneeId) : undefined;
        const ok = parsed.assignee.some((a) =>
          a === 'me' || a === 'eu' ? t.assigneeId === meId : a === 'none' || a === 'nenhum' ? !t.assigneeId : t.assigneeId === a || normalize(assignee?.name ?? '').includes(a),
        );
        if (!ok) return false;
      }
      if (!q) return true;
      if (idQuery && String(t.id).startsWith(idQuery)) return true;
      if (q.startsWith('#') && !idQuery) return false;
      const requester = byId.get(t.requesterId);
      return [t.subject, requester?.name ?? '', requester?.email ?? ''].some((f) => normalize(f).includes(q));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const users = hasOps || idQuery ? [] : data.users.filter((u) => [u.name, u.email].some((f) => normalize(f).includes(q)));
  const orgs = hasOps || idQuery ? [] : data.orgs.filter((o) => [o.name, ...o.domains].some((f) => normalize(f).includes(q)));
  return { tickets, users, orgs };
}
