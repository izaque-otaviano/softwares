import type { Trigger } from '@/types/domain';
import { ApiError, simulate } from './delay';
import { db } from './db';

export function listTriggers(): Promise<Trigger[]> {
  return simulate(() => db.triggers);
}

export function getTrigger(id: string): Promise<Trigger> {
  return simulate(() => {
    const t = db.triggers.find((x) => x.id === id);
    if (!t) throw new ApiError('Gatilho não encontrado.');
    return t;
  });
}

export function saveTrigger(trigger: Omit<Trigger, 'id' | 'fired7d'> & { id?: string; fired7d?: number }): Promise<Trigger> {
  return simulate(() => {
    const idx = trigger.id ? db.triggers.findIndex((t) => t.id === trigger.id) : -1;
    const saved: Trigger = { fired7d: 0, ...trigger, id: trigger.id ?? `t${Date.now().toString(36)}` };
    if (idx >= 0) db.triggers[idx] = saved;
    else db.triggers.push(saved);
    return saved;
  });
}

export function setTriggerActive(id: string, active: boolean): Promise<Trigger> {
  return simulate(() => {
    const i = db.triggers.findIndex((t) => t.id === id);
    if (i < 0) throw new ApiError('Gatilho não encontrado.');
    db.triggers[i] = { ...db.triggers[i], active };
    return db.triggers[i];
  });
}

export function deleteTrigger(id: string): Promise<void> {
  return simulate(() => {
    db.triggers = db.triggers.filter((t) => t.id !== id);
  });
}
