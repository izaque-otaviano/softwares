import type { RefOption, SlaPolicy, SlaPolicyInput } from '@/types/admin-a';
import { ApiError } from '../errors';
import { adminALocal } from './adminLocal';
import { http } from './http';
import { mapRef, mapSlaPolicy, slaToDto, type SlaPolicyDto, type TeamRefDto } from './mappers/adminA';
import { listAll } from './refs';

/**
 * SLA: `/settings/sla-policies/` (interno lê, administrador escreve). O backend guarda UMA meta de primeira resposta e
 * UMA de solução por política (plano x equipe, mais específico vence) e se conta só em horário comercial. Metas por
 * prioridade não existem lá: ficam neste navegador.
 */
const withLocal = (p: SlaPolicy): SlaPolicy => ({ ...p, priorityTargets: adminALocal.slaPriority.get(p.id) ?? {} });

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  const rows = await listAll<SlaPolicyDto>('/settings/sla-policies/');
  return rows.map(mapSlaPolicy).map(withLocal);
}

export async function saveSlaPolicy(input: SlaPolicyInput): Promise<SlaPolicy> {
  const body = slaToDto(input);
  let dto: SlaPolicyDto;
  try {
    dto = input.id ? await http.patch<SlaPolicyDto>(`/settings/sla-policies/${input.id}/`, body) : await http.post<SlaPolicyDto>('/settings/sla-policies/', body);
  } catch (e) {
    // O backend responde "Os campos plan, team devem criar um set único.": diz o mesmo em português claro.
    if (e instanceof ApiError && e.status === 400 && /set único|unique set/i.test(e.message)) {
      throw new ApiError('Já existe uma política para este plano e esta equipe. Edite a existente ou escolha outra combinação.', { status: 400, fieldErrors: e.fieldErrors, body: e.body });
    }
    throw e;
  }
  const saved = mapSlaPolicy(dto);
  adminALocal.slaPriority.set(saved.id, input.priorityTargets);
  return withLocal(saved);
}

export async function deleteSlaPolicy(id: string): Promise<void> {
  await http.delete(`/settings/sla-policies/${id}/`);
  adminALocal.slaPriority.delete(id);
}

export async function getSlaRefs(): Promise<{ plans: RefOption[]; teams: RefOption[]; defaultCalendar: string | null }> {
  const [plans, teams, calendars] = await Promise.all([
    listAll<TeamRefDto>('/settings/plans/'),
    listAll<TeamRefDto>('/settings/teams/'),
    listAll<{ name: string; is_default: boolean }>('/settings/calendars/'),
  ]);
  return {
    plans: plans.map(mapRef),
    teams: teams.filter((t) => t.is_active !== false).map(mapRef),
    defaultCalendar: calendars.find((c) => c.is_default)?.name ?? null,
  };
}
