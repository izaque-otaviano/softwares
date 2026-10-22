import type { Macro } from '@/types/domain';
import { ApiError, simulate } from './delay';
import { db } from './db';

export function listMacros(): Promise<Macro[]> {
  return simulate(() => db.macros);
}

export function getMacro(id: string): Promise<Macro> {
  return simulate(() => {
    const m = db.macros.find((x) => x.id === id);
    if (!m) throw new ApiError('Macro não encontrada.');
    return m;
  });
}

/** Cria (sem `id`) ou substitui (com `id`). */
export function saveMacro(macro: Omit<Macro, 'id' | 'usage7d'> & { id?: string; usage7d?: number }): Promise<Macro> {
  return simulate(() => {
    const existing = macro.id ? db.macros.findIndex((m) => m.id === macro.id) : -1;
    const now = new Date().toISOString();
    const saved: Macro = {
      usage7d: 0,
      ...macro,
      id: macro.id ?? `m${Date.now().toString(36)}`,
      createdAt: macro.createdAt ?? (existing >= 0 ? db.macros[existing]!.createdAt : undefined) ?? now,
      updatedAt: now,
    };
    if (existing >= 0) db.macros[existing] = saved;
    else db.macros.push(saved);
    return saved;
  });
}

export function deleteMacro(id: string): Promise<void> {
  return simulate(() => {
    db.macros = db.macros.filter((m) => m.id !== id);
  });
}
