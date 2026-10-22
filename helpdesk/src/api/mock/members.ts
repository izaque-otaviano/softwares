import type { Group, User } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

export type StaffRole = 'agent' | 'admin';

export const ROLE_LABEL: Record<StaffRole, string> = { agent: 'Agente', admin: 'Administrador' };

/** Licenças de agente contratadas (protótipo). */
export const AGENT_SEATS = 5;

export interface Member {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  roleLabel: string;
  groups: string[];
  productAccess: string;
  /** ISO do último acesso; `undefined` = convite pendente. */
  lastSeenAt?: string;
  pending: boolean;
  suspended: boolean;
}

export interface Licenses {
  used: number;
  total: number;
}

export interface RoleRow {
  /** Mock: 'admin' | 'agent'; real: `internal_role` do backend (admin, supervisor, agent, light_agent). */
  id: string;
  name: string;
  description: string;
  members: number;
}

export interface GroupRow {
  id: string;
  name: string;
  members: number;
  memberNames: string[];
}

const isStaff = (u: User): u is User & { role: StaffRole } => u.role === 'agent' || u.role === 'admin';

function toMember(u: User & { role: StaffRole }): Member {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: ROLE_LABEL[u.role],
    groups: db.groups.filter((g) => g.agentIds.includes(u.id)).map((g) => g.name),
    productAccess: u.role === 'admin' ? 'Suporte, Administração' : 'Suporte',
    lastSeenAt: u.lastSeenAt,
    pending: !u.lastSeenAt,
    suspended: Boolean(u.suspended),
  };
}

export function listMembers(): Promise<Member[]> {
  return simulate(() => db.users.filter(isStaff).map(toMember));
}

export function getLicenses(): Promise<Licenses> {
  return simulate(() => ({
    used: db.users.filter((u) => u.role === 'agent' && u.lastSeenAt && !u.suspended).length,
    total: AGENT_SEATS,
  }));
}

export interface NewMember {
  name: string;
  email: string;
  role: StaffRole;
  groupId?: string;
}

export function createMember(input: NewMember): Promise<Member> {
  return simulate(() => {
    const email = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw new ApiError('Já existe um usuário com este e-mail.');
    const now = new Date().toISOString();
    const user: User = {
      id: `m${Date.now().toString(36)}${db.users.length}`,
      name: input.name.trim(),
      email,
      role: input.role,
      tags: [],
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
    if (input.groupId) {
      db.groups = db.groups.map((g) => (g.id === input.groupId ? { ...g, agentIds: [...g.agentIds, user.id] } : g));
    }
    return toMember(user as User & { role: StaffRole });
  });
}

export function setMemberSuspended(id: string, suspended: boolean): Promise<Member> {
  return simulate(() => {
    const i = db.users.findIndex((u) => u.id === id);
    const u = db.users[i];
    if (!u || !isStaff(u)) throw new ApiError('Membro não encontrado.');
    db.users[i] = { ...u, suspended, updatedAt: new Date().toISOString() };
    return toMember(db.users[i] as User & { role: StaffRole });
  });
}

export function listRoles(): Promise<RoleRow[]> {
  return simulate(() => {
    const count = (r: StaffRole) => db.users.filter((u) => u.role === r).length;
    return [
      { id: 'admin', name: 'Administrador', description: 'Acesso total às configurações, pessoas e produtos.', members: count('admin') },
      { id: 'agent', name: 'Agente', description: 'Atende tickets, usa macros e consulta clientes e organizações.', members: count('agent') },
    ];
  });
}

export function listGroupRows(): Promise<GroupRow[]> {
  return simulate(() =>
    db.groups.map((g: Group) => {
      const names = g.agentIds.map((id) => db.users.find((u) => u.id === id)?.name).filter((n): n is string => Boolean(n));
      return { id: g.id, name: g.name, members: names.length, memberNames: names };
    }),
  );
}
