import { parseQuery, searchAll } from '@/lib/search';
import type { Org, SearchResults, Ticket, User } from '@/types/domain';
import * as mock from '../mock/search';
import { getRealMeId } from './auth';
import { http, type Paginated } from './http';
import { mapSearchCompany, mapSearchRequester, normName, type SearchPreviewDto, type TicketDto } from './mappers';
import { getOrgs, getClients, getStatuses } from './refs';
import { getTicket, listTickets } from './tickets';
import { listUsers } from './users';
import { listOrgs } from './orgs';

/**
 * BUSCA (leitura real).
 *  - Prévia (busca global, padrão): `GET /search/?q=` (mín. 2 caracteres; até 8 por grupo). Os tickets vêm completos
 *    do cache de tickets (ou do detalhe) e clientes/empresas completam com o diretório.
 *  - Completa (`{ full: true }`, página de resultados): tickets por `GET /tickets/?q=` (referência, pedido e assunto,
 *    sem acento, paginado); clientes e empresas filtrados no navegador sobre o diretório já carregado.
 *  - Operadores do Helpdesk (`status:`, `priority:`, `assignee:`) e `#id`/número não existem no backend: avaliados
 *    no navegador sobre os tickets carregados (mesmo motor do mock).
 */
export interface SearchOptions {
  full?: boolean;
}

const EMPTY: SearchResults = { tickets: [], users: [], orgs: [] };

async function ticketsByIds(ids: number[]): Promise<Ticket[]> {
  const all = await listTickets().catch(() => [] as Ticket[]);
  const byId = new Map(all.map((t) => [t.id, t]));
  const out: Ticket[] = [];
  for (const id of ids) {
    const hit = byId.get(id) ?? (await getTicket(id).catch(() => null));
    if (hit) out.push(hit);
  }
  return out;
}

export async function search(term: string, opts: SearchOptions = {}): Promise<SearchResults> {
  const q = term.trim();
  if (!q) return EMPTY;
  const parsed = parseQuery(q);
  const hasOps = parsed.status.length + parsed.priority.length + parsed.assignee.length > 0;
  const idQuery = /^#?\d+$/.test(parsed.text);

  if (hasOps || idQuery) {
    const [tickets, users, orgs, statuses] = await Promise.all([listTickets(), listUsers(), listOrgs(), getStatuses()]);
    return searchAll(q, { tickets, users, orgs, statuses }, getRealMeId());
  }
  if (q.length < 2) return EMPTY;

  if (!opts.full) {
    const res = await http.get<SearchPreviewDto>('/search/', { q });
    const [tickets, clients, orgs] = await Promise.all([ticketsByIds(res.tickets.map((t) => t.id)), getClients().catch(() => [] as User[]), getOrgs().catch(() => [] as Org[])]);
    const userById = new Map(clients.map((u) => [u.id, u]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    return {
      tickets,
      users: res.requesters.map((r) => userById.get(String(r.id)) ?? mapSearchRequester(r)),
      orgs: res.companies.map((c) => orgById.get(String(c.id)) ?? mapSearchCompany(c)),
    };
  }

  const [ticketPage, users, orgs] = await Promise.all([
    http.get<Paginated<TicketDto>>('/tickets/', { q, limit: 200 }),
    listUsers({ role: 'end_user', query: q }),
    listOrgs(),
  ]);
  const needle = normName(q);
  return {
    tickets: await ticketsByIds(ticketPage.results.map((t) => t.id)),
    users,
    orgs: orgs.filter((o) => [o.name, ...o.domains].some((f) => normName(f).includes(needle))),
  };
}

// Recentes e "visualizados": locais por natureza (o backend não tem API de itens recentes).
export const recentViewed = mock.recentViewed;
export const trackViewed = mock.trackViewed;
export type { RecentItem } from '../mock/search';
