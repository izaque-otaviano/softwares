import type { Plan, PlanInput } from '@/types/admin-a';
import { http } from './http';
import { mapPlan, planToDto, type PlanDto } from './mappers/adminA';
import { listAll } from './refs';

/** Planos: `/settings/plans/` (interno lê, administrador escreve). Excluir = DESATIVAR (o plano em uso é protegido). */
export async function listPlans(): Promise<Plan[]> {
  return (await listAll<PlanDto>('/settings/plans/')).map(mapPlan);
}

export async function savePlan(input: PlanInput): Promise<Plan> {
  const body = planToDto(input);
  const dto = input.id ? await http.patch<PlanDto>(`/settings/plans/${input.id}/`, body) : await http.post<PlanDto>('/settings/plans/', body);
  return mapPlan(dto);
}

export async function deletePlan(id: string): Promise<void> {
  await http.delete(`/settings/plans/${id}/`);
}
