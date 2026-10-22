import type { Group, StatusCategory, Trigger, TriggerAction, TicketStatus } from '@/types/domain';
import * as mock from '../mock/triggers';
import { factoryStatusFor } from './mappers';
import { getGroups, getStatuses } from './refs';

// Gatilhos: o backend não tem (capabilities.triggers = 'local'). O motor e o CRUD seguem no navegador sobre os gatilhos
// de exemplo do mock; só que os de exemplo citam status/grupos do mock ('pending', 'g2'...). No modo real esses ids
// são traduzidos para os reais na leitura (status pela categoria; grupo pela posição), para o motor local nunca gravar
// um id inexistente num ticket real.
export * from '../mock/triggers';

const MOCK_STATUS_CATEGORY: Record<string, StatusCategory> = { new: 'new', open: 'open', in_progress: 'open', pending: 'pending', solved: 'solved' };

function mapAction(a: TriggerAction, statuses: TicketStatus[], groups: Group[]): TriggerAction {
  if (a.kind === 'set_status' && !statuses.some((s) => s.id === a.statusId)) {
    const category = MOCK_STATUS_CATEGORY[a.statusId];
    const target = category ? factoryStatusFor(statuses, category) : undefined;
    return target ? { ...a, statusId: target.id } : a;
  }
  if (a.kind === 'assign_group' && !groups.some((g) => g.id === a.groupId) && groups.length > 0) {
    const index = Math.max(0, Number(/\d+/.exec(a.groupId)?.[0] ?? 1) - 1);
    return { ...a, groupId: groups[Math.min(index, groups.length - 1)]!.id };
  }
  return a;
}

async function translate(list: Trigger[]): Promise<Trigger[]> {
  const [statuses, groups] = await Promise.all([getStatuses().catch(() => [] as TicketStatus[]), getGroups().catch(() => [] as Group[])]);
  return list.map((t) => ({ ...t, actions: t.actions.map((a) => mapAction(a, statuses, groups)) }));
}

export async function listTriggers(): Promise<Trigger[]> {
  return translate(await mock.listTriggers());
}

export async function getTrigger(id: string): Promise<Trigger> {
  return (await translate([await mock.getTrigger(id)]))[0]!;
}
