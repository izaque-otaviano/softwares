import type { GroupRow, Licenses, Member, RoleRow } from '@/api/members';
import type { Group } from '@/types/domain';
import type { LicensesDto, UserDto } from './dto';
import { INTERNAL_ROLE_LABEL, mapRole } from './user';

/** Agente/admin do backend -> Member (Admin > Membros). `pending` = convite ainda não aceito (`invite_status`). */
export function mapMember(dto: UserDto, groups: Group[]): Member {
  const role = mapRole(dto) === 'admin' ? 'admin' : 'agent';
  const id = String(dto.id);
  const teamIds = new Set((dto.team_ids ?? []).map(String));
  return {
    id,
    name: dto.full_name?.trim() || dto.email,
    email: dto.email,
    role,
    roleLabel: dto.custom_role_name || (dto.internal_role ? INTERNAL_ROLE_LABEL[dto.internal_role] : undefined) || (role === 'admin' ? 'Administrador' : 'Agente'),
    groups: groups.filter((g) => g.agentIds.includes(id) || teamIds.has(g.id)).map((g) => g.name),
    productAccess: role === 'admin' ? 'Suporte, Administração' : 'Suporte',
    lastSeenAt: dto.last_seen_at ?? dto.last_login ?? undefined,
    pending: dto.invite_status !== undefined ? dto.invite_status !== 'aceito' : !(dto.last_seen_at ?? dto.last_login),
    suspended: dto.is_active === false,
  };
}

const ROLE_DESCRIPTION: Record<string, string> = {
  admin: 'Acesso total às configurações, pessoas e produtos.',
  supervisor: 'Coordena equipes, acompanha filas e atua nos tickets das suas equipes.',
  agent: 'Atende tickets, usa macros e consulta clientes e organizações.',
  light_agent: 'Agente com permissões reduzidas (acompanha e comenta, sem atender tickets).',
};

/** Contagem por função interna (`internal_role`). */
export function mapRoles(staff: UserDto[]): RoleRow[] {
  return ['admin', 'supervisor', 'agent', 'light_agent'].map((r) => ({
    id: r,
    name: INTERNAL_ROLE_LABEL[r]!,
    description: ROLE_DESCRIPTION[r]!,
    members: staff.filter((u) => u.internal_role === r).length,
  }));
}

export function mapGroupRows(groups: Group[], staff: UserDto[]): GroupRow[] {
  const nameById = new Map(staff.map((u) => [String(u.id), u.full_name]));
  return groups.map((g) => {
    const names = g.agentIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n));
    return { id: g.id, name: g.inactive ? `${g.name} (inativa)` : g.name, members: g.agentIds.length, memberNames: names };
  });
}

/** `GET /settings/licenses/` -> licenças. `total` nulo = sem limite (`unlimited`). */
export function mapLicenses(dto: LicensesDto): Licenses {
  const unlimited = dto.unlimited || dto.total === null;
  return {
    used: dto.used,
    total: unlimited ? null : dto.total,
    available: unlimited ? null : (dto.available ?? Math.max(0, (dto.total ?? 0) - dto.used)),
    unlimited,
  };
}
