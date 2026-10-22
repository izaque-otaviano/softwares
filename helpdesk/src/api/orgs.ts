import type { Org } from '@/types/domain';
import { ApiError, simulate } from './delay';
import { db } from './db';

export function listOrgs(): Promise<Org[]> {
  return simulate(() => db.orgs);
}

export function getOrg(id: string): Promise<Org> {
  return simulate(() => {
    const o = db.orgs.find((x) => x.id === id);
    if (!o) throw new ApiError('Organização não encontrada.');
    return o;
  });
}

export function updateOrg(id: string, patch: Partial<Omit<Org, 'id'>>): Promise<Org> {
  return simulate(() => {
    const i = db.orgs.findIndex((o) => o.id === id);
    if (i < 0) throw new ApiError('Organização não encontrada.');
    db.orgs[i] = { ...db.orgs[i], ...patch, updatedAt: new Date().toISOString() };
    return db.orgs[i];
  });
}

export function createOrg(input: Pick<Org, 'name'> & Partial<Omit<Org, 'id' | 'name'>>): Promise<Org> {
  return simulate(() => {
    const now = new Date().toISOString();
    const org: Org = { domains: [], tags: [], userAccess: 'own_tickets', createdAt: now, updatedAt: now, ...input, id: `o${Date.now().toString(36)}` };
    db.orgs.push(org);
    return org;
  });
}

export function deleteOrg(id: string): Promise<void> {
  return simulate(() => {
    const i = db.orgs.findIndex((o) => o.id === id);
    if (i < 0) throw new ApiError('Organização não encontrada.');
    db.orgs.splice(i, 1);
    db.users.forEach((u) => {
      if (u.orgId === id) u.orgId = undefined;
    });
  });
}

/** Move os usuários da origem para o destino e apaga a organização de origem. */
export function mergeOrgs(sourceId: string, targetId: string): Promise<Org> {
  return simulate(() => {
    const target = db.orgs.find((o) => o.id === targetId);
    const i = db.orgs.findIndex((o) => o.id === sourceId);
    if (!target || i < 0 || sourceId === targetId) throw new ApiError('Organização não encontrada.');
    const source = db.orgs[i]!;
    db.users.forEach((u) => {
      if (u.orgId === sourceId) u.orgId = targetId;
    });
    target.domains = [...new Set([...target.domains, ...source.domains])];
    target.tags = [...new Set([...target.tags, ...source.tags])];
    target.updatedAt = new Date().toISOString();
    db.orgs.splice(i, 1);
    return target;
  });
}
