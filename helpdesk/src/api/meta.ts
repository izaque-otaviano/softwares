import type { Group, TicketField, TicketStatus } from '@/types/domain';
import { ApiError, simulate } from './delay';
import { db } from './db';

export const listGroups = (): Promise<Group[]> => simulate(() => db.groups);
export const listStatuses = (): Promise<TicketStatus[]> => simulate(() => db.statuses);
export const listFields = (): Promise<TicketField[]> => simulate(() => db.fields);

/** Cria (sem `id`) ou substitui (com `id`) um status. Muta o mesmo array para quem o referencia. */
export function saveStatus(status: Omit<TicketStatus, 'id'> & { id?: string }): Promise<TicketStatus> {
  return simulate(() => {
    const idx = status.id ? db.statuses.findIndex((s) => s.id === status.id) : -1;
    if (status.id && idx < 0) throw new ApiError('Status não encontrado.');
    const saved: TicketStatus = { ...status, id: status.id ?? `s${Date.now().toString(36)}${db.statuses.length}` };
    db.statuses = idx >= 0 ? db.statuses.map((s, i) => (i === idx ? saved : s)) : [...db.statuses, saved];
    return saved;
  });
}
