import type { Plan, PlanInput } from '@/types/admin-a';
import { plans as mock } from './mock/adminA';
import { IS_REAL } from './mode';
import * as real from './real/plans';

export const listPlans = (): Promise<Plan[]> => (IS_REAL ? real.listPlans() : mock.list());
export const savePlan = (input: PlanInput): Promise<Plan> => (IS_REAL ? real.savePlan(input) : mock.save(input));
/** O backend DESATIVA o plano (o plano em uso é protegido). */
export const deletePlan = (id: string): Promise<void> => (IS_REAL ? real.deletePlan(id) : mock.remove(id));
