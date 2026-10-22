import type { Trigger } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
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
    const saved: Trigger = { fired7d: 0, ...trigger, id: trigger.id ?? `t${Date.now().toString(36)}`, updatedAt: new Date().toISOString() };
    if (idx >= 0) db.triggers[idx] = saved;
    else db.triggers.push(saved);
    return saved;
  });
}

export function setTriggerActive(id: string, active: boolean): Promise<Trigger> {
  return simulate(() => {
    const i = db.triggers.findIndex((t) => t.id === id);
    if (i < 0) throw new ApiError('Gatilho não encontrado.');
    db.triggers[i] = { ...db.triggers[i], active, updatedAt: new Date().toISOString() };
    return db.triggers[i];
  });
}

export function deleteTrigger(id: string): Promise<void> {
  return simulate(() => {
    db.triggers = db.triggers.filter((t) => t.id !== id);
  });
}

/** Define a ordem de avaliação: `ids` na ordem desejada (ids ausentes vão ao final, na ordem atual). */
export function reorderTriggers(ids: string[]): Promise<Trigger[]> {
  return simulate(() => {
    const byId = new Map(db.triggers.map((t) => [t.id, t]));
    const first = ids.map((id) => byId.get(id)).filter((t): t is Trigger => Boolean(t));
    const rest = db.triggers.filter((t) => !ids.includes(t.id));
    db.triggers = [...first, ...rest];
    return db.triggers;
  });
}

/** Contabiliza disparos do motor local (alimenta "Iniciado por gatilho (7d)"). Nunca falha. */
export function recordTriggerFires(ids: string[]): Promise<void> {
  return simulate(
    () => {
      for (const id of ids) {
        const t = db.triggers.find((x) => x.id === id);
        if (t) t.fired7d += 1;
      }
    },
    { critical: true },
  );
}
