import type { Group, Macro, Org, TicketStatus, User } from '@/types/domain';
import { ApiError } from '../errors';
import { http, relativeNext, type Paginated } from './http';
import { mapCompany, mapMacro, mapRoster, mapStatus, mapTeam, mapUser, type CompanyDto, type MacroDto, type RosterDto, type StatusDto, type TagDto, type TeamDto, type UserDto } from './mappers';

/**
 * Dados de referência do backend (status, equipes, usuários, empresas, tags), com cache curto e deduplicação de
 * chamadas em voo. Falha NÃO é guardada. `resetRealCache()` roda no logout/401 (ver store/sessionEffects).
 */
const TTL_MS = 30_000;
const resets: (() => void)[] = [];

export function memo<T>(load: () => Promise<T>, ttl = TTL_MS) {
  let hit: { at: number; promise: Promise<T> } | null = null;
  const get = (force = false): Promise<T> => {
    if (!force && hit && Date.now() - hit.at < ttl) return hit.promise;
    const promise = load();
    const entry = { at: Date.now(), promise };
    hit = entry;
    promise.catch(() => {
      if (hit === entry) hit = null;
    });
    return promise;
  };
  const reset = () => {
    hit = null;
  };
  resets.push(reset);
  return Object.assign(get, { reset });
}

export function resetRealCache(): void {
  resets.forEach((r) => r());
}

/** Lista completa de um endpoint: aceita array puro (`/users/`, `/teams/`) e envelope paginado. */
export async function listAll<T>(path: string, query: Record<string, string | number | boolean> = {}, limit = 500, maxPages = 40): Promise<T[]> {
  const first = await http.get<Paginated<T> | T[]>(path, { limit, ...query });
  if (Array.isArray(first)) return first;
  const out = [...first.results];
  let page = first;
  for (let i = 1; page.next && i < maxPages; i++) {
    page = await http.get<Paginated<T>>(relativeNext(page.next));
    out.push(...page.results);
  }
  return out;
}

const forbidden = (e: unknown): boolean => e instanceof ApiError && (e.status === 403 || e.status === 404);

export const getStatuses = memo<TicketStatus[]>(async () => (await listAll<StatusDto>('/settings/statuses/')).map(mapStatus));
export const getTags = memo<TagDto[]>(() => listAll<TagDto>('/settings/tags/').catch((e) => (forbidden(e) ? [] : Promise.reject(e))));

/** Equipes com agentes (roster, só admin); sem permissão cai em `/teams/` (sem `agentIds`). */
export const getGroups = memo<Group[]>(async () => {
  try {
    return mapRoster(await http.get<RosterDto>('/settings/teams/roster/'));
  } catch (e) {
    if (!forbidden(e)) throw e;
    return (await listAll<TeamDto>('/teams/')).map((t) => mapTeam(t));
  }
});

/** Equipes cruas (admin: `/settings/teams/`) para a tela de grupos; cai em `/teams/`. */
export const getTeamDtos = memo<TeamDto[]>(async () => {
  try {
    return await listAll<TeamDto>('/settings/teams/');
  } catch (e) {
    if (!forbidden(e)) throw e;
    return listAll<TeamDto>('/teams/');
  }
});

async function listUsersOfKind(kind: 'internal' | 'client'): Promise<UserDto[]> {
  try {
    return await listAll<UserDto>('/settings/users/', { kind });
  } catch (e) {
    if (!forbidden(e)) throw e;
    return listAll<UserDto>('/users/', { kind });
  }
}

export const getStaffDtos = memo<UserDto[]>(() => listUsersOfKind('internal'));
export const getClientDtos = memo<UserDto[]>(() => listUsersOfKind('client'));
export const getStaff = memo<User[]>(async () => (await getStaffDtos()).map(mapUser));
export const getClients = memo<User[]>(async () => (await getClientDtos()).map(mapUser));

export const getCompanyDtos = memo<CompanyDto[]>(async () => {
  try {
    return await listAll<CompanyDto>('/settings/companies/');
  } catch (e) {
    if (!forbidden(e)) throw e;
    return listAll<CompanyDto>('/companies/');
  }
});
/** Empresas ativas (a desativada — "apagada" no Helpdesk — não aparece). */
export const getOrgs = memo<Org[]>(async () => (await getCompanyDtos()).filter((d) => d.is_active !== false).map(mapCompany));

export const getMacros = memo<Macro[]>(async () => {
  const [dtos, tags] = await Promise.all([listAll<MacroDto>('/settings/ticket-macros/'), getTags().catch(() => [] as TagDto[])]);
  return dtos.map((d) => mapMacro(d, tags));
});

