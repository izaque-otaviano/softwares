import type { Group, TicketField, TicketStatus } from '@/types/domain';
import { simulate } from './delay';
import { db } from './db';

export const listGroups = (): Promise<Group[]> => simulate(() => db.groups);
export const listStatuses = (): Promise<TicketStatus[]> => simulate(() => db.statuses);
export const listFields = (): Promise<TicketField[]> => simulate(() => db.fields);
