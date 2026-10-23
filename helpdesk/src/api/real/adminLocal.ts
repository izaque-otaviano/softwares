import type { Priority } from '@/types/domain';
import type { PriorityTarget } from '@/types/admin-a';

/**
 * Parte das telas de administração A que o backend NÃO tem. Vale só neste navegador (em memória; recarregar descarta):
 * metas de SLA por prioridade e feriado que repete todo ano.
 */
export const adminALocal = {
  slaPriority: new Map<string, Partial<Record<Priority, PriorityTarget>>>(),
  holidayRecurring: new Map<string, boolean>(),
};

export function resetAdminALocal(): void {
  adminALocal.slaPriority.clear();
  adminALocal.holidayRecurring.clear();
}
