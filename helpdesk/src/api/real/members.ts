import type { GroupRow, Licenses, Member, NewMember, RoleRow } from '../mock/members';
import { http } from './http';
import { mapGroupRows, mapLicenses, mapMember, mapRoles, type LicensesDto, type UserDto } from './mappers';
import { getGroups, getStaff, getStaffDtos } from './refs';

export { ROLE_LABEL } from '../mock/members';

/** MEMBROS (Admin > Membros/Funções/Grupos), leitura real: `/settings/users/?kind=internal` + roster de equipes. */
export async function listMembers(): Promise<Member[]> {
  const [dtos, groups] = await Promise.all([getStaffDtos(), getGroups().catch(() => [])]);
  return dtos.map((d) => mapMember(d, groups));
}

/**
 * Licenças de agente (assentos) do servidor: `GET /settings/licenses/` (qualquer interno). Assento = interno ativo com
 * papel admin, supervisor ou agent; convite pendente conta. `total` nulo = sem limite.
 */
export async function getLicenses(): Promise<Licenses> {
  return mapLicenses(await http.get<LicensesDto>('/settings/licenses/'));
}

/** Só administrador. `{total:N}` ou `{total:null}` (sem limite); abaixo do uso o servidor recusa (400 `seat_total_below_used`). */
export async function setLicenseTotal(total: number | null): Promise<Licenses> {
  return mapLicenses(await http.patch<LicensesDto>('/settings/licenses/', { total }));
}

export async function listRoles(): Promise<RoleRow[]> {
  return mapRoles(await getStaffDtos());
}

export async function listGroupRows(): Promise<GroupRow[]> {
  const [groups, dtos] = await Promise.all([getGroups(), getStaffDtos().catch(() => [])]);
  return mapGroupRows(groups, dtos);
}

// ESCRITAS REAIS (só administrador; 403 vira mensagem de permissão).

const invalidateStaff = (): void => {
  getStaffDtos.reset();
  getStaff.reset();
  getGroups.reset();
};

/**
 * Cria o membro: com grupo, `POST /settings/teams/{id}/agents/` (já lotado); sem grupo, `POST /settings/users/`
 * (kind interno). Nos dois o backend envia o convite por e-mail e o membro nasce com convite pendente.
 */
export async function createMember(input: NewMember): Promise<Member> {
  const body = { email: input.email.trim().toLowerCase(), full_name: input.name.trim(), internal_role: input.role === 'admin' ? 'admin' : 'agent' };
  const dto = input.groupId
    ? await http.post<UserDto>(`/settings/teams/${input.groupId}/agents/`, body)
    : await http.post<UserDto>('/settings/users/', { ...body, kind: 'internal' });
  invalidateStaff();
  return mapMember(dto, await getGroups().catch(() => []));
}

/** "Suspender" = desativar (`is_active:false`); reativar = `is_active:true`. O backend nunca apaga usuário. */
export async function setMemberSuspended(id: string, suspended: boolean): Promise<Member> {
  const dto = await http.patch<UserDto>(`/settings/users/${id}/`, { is_active: !suspended });
  invalidateStaff();
  return mapMember(dto, await getGroups().catch(() => []));
}

export type { GroupRow, Licenses, Member, NewMember, RoleRow };
export type { StaffRole } from '../mock/members';
