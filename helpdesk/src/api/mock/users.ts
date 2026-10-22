import type { User } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

export interface UserFilter {
  role?: User['role'];
  orgId?: string;
  query?: string;
}

export function listUsers(filter: UserFilter = {}): Promise<User[]> {
  return simulate(() => {
    const q = filter.query?.toLowerCase();
    return db.users.filter(
      (u) =>
        (!filter.role || u.role === filter.role) &&
        (!filter.orgId || u.orgId === filter.orgId) &&
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  });
}

export function getUser(id: string): Promise<User> {
  return simulate(() => {
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new ApiError('Usuário não encontrado.');
    return u;
  });
}

export function updateUser(id: string, patch: Partial<Omit<User, 'id'>>): Promise<User> {
  return simulate(() => {
    const i = db.users.findIndex((u) => u.id === id);
    if (i < 0) throw new ApiError('Usuário não encontrado.');
    db.users[i] = { ...db.users[i], ...patch, updatedAt: new Date().toISOString() };
    return db.users[i];
  });
}

export function createUser(input: Pick<User, 'name' | 'email'> & Partial<Omit<User, 'id' | 'name' | 'email'>>): Promise<User> {
  return simulate(() => {
    const now = new Date().toISOString();
    const user: User = { role: 'end_user', tags: [], language: 'pt-BR', timezone: 'America/Sao_Paulo', createdAt: now, updatedAt: now, ...input, id: `u${Date.now().toString(36)}` };
    db.users.push(user);
    return user;
  });
}

export function deleteUser(id: string): Promise<void> {
  return simulate(() => {
    const i = db.users.findIndex((u) => u.id === id);
    if (i < 0) throw new ApiError('Usuário não encontrado.');
    db.users.splice(i, 1);
  });
}

/** Passa os tickets do usuário de origem para o destino e apaga o de origem. */
export function mergeUsers(sourceId: string, targetId: string): Promise<User> {
  return simulate(() => {
    const target = db.users.find((u) => u.id === targetId);
    const i = db.users.findIndex((u) => u.id === sourceId);
    if (!target || i < 0 || sourceId === targetId) throw new ApiError('Usuário não encontrado.');
    db.tickets.forEach((t) => {
      if (t.requesterId === sourceId) t.requesterId = targetId;
    });
    target.tags = [...new Set([...target.tags, ...db.users[i]!.tags])];
    target.updatedAt = new Date().toISOString();
    db.users.splice(i, 1);
    return target;
  });
}
