import { agents, endUsers, admins, fields, groups, macros, orgs, statuses, tickets, triggers, views } from './data';
import type { Group, Macro, Org, Ticket, TicketField, TicketStatus, Trigger, User, View } from '@/types/domain';

export interface RecentItem {
  kind: 'ticket' | 'user' | 'org';
  id: string;
  title: string;
  meta: string;
  at: string;
}

interface Db {
  tickets: Ticket[];
  users: User[];
  orgs: Org[];
  groups: Group[];
  statuses: TicketStatus[];
  views: View[];
  macros: Macro[];
  triggers: Trigger[];
  fields: TicketField[];
  recent: RecentItem[];
}

function seed(): Db {
  return {
    tickets: structuredClone(tickets),
    users: structuredClone([...endUsers, ...agents, ...admins]),
    orgs: structuredClone(orgs),
    groups: structuredClone(groups),
    statuses: structuredClone(statuses),
    views: structuredClone(views),
    macros: structuredClone(macros),
    triggers: structuredClone(triggers),
    fields: structuredClone(fields),
    recent: [],
  };
}

/** "Banco" em memória do protótipo. Mutável; use `resetDb()` nos testes. */
export const db: Db = seed();

export function resetDb(): void {
  Object.assign(db, seed());
}
