import type { Group, User } from '@/types/domain';
import { ApiError } from '../errors';
import { simulate } from './delay';
import { db } from './db';

export type StaffRole = 'agent' | 'admin';

export const ROLE_LABEL: Record<StaffRole, string> = { agent: 'Agente', admin: 'Administrador' };


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
  /** `null` = sem limite. */
  total: number | null;
  available: number | null;
  unlimited: boolean;
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

// Licenças do protótipo: o total (`db.seatTotal`, 5 de início) o administrador muda na tela de Membros; `null` = sem
// limite. Membros criados na sessão (convite pendente) também ocupam vaga, como no backend.
const seatsUsed = (): number => db.users.filter((u) => u.role === 'agent' && (u.lastSeenAt || db.createdSeats.includes(u.id)) && !u.suspended).length;

const licensesNow = (): Licenses => {
  const used = seatsUsed();
  return db.seatTotal === null ? { used, total: null, available: null, unlimited: true } : { used, total: db.seatTotal, available: Math.max(0, db.seatTotal - used), unlimited: false };
};

/** Mesma regra do backend: sem vaga livre, criar/reativar um agente é recusado com 409 `seat_limit_reached`. */
function assertSeatFree(): void {
  const l = licensesNow();
  if (!l.unlimited && l.available! <= 0) {
    throw new ApiError(`O limite de licenças de agente foi atingido (${l.used} de ${l.total}). Aumente o total de licenças ou desative um agente.`, { status: 409, code: 'seat_limit_reached' });
  }
}

export function getLicenses(): Promise<Licenses> {
  return simulate(() => licensesNow());
}

/** Só administrador. `null` = sem limite; abaixo do uso é recusado (400 `seat_total_below_used`). */
export function setLicenseTotal(total: number | null): Promise<Licenses> {
  return simulate(() => {
    const used = seatsUsed();
    if (total !== null && (!Number.isInteger(total) || total < 0)) throw new ApiError('Informe um número inteiro maior ou igual a zero.', { status: 400, fieldErrors: { total: ['Informe um número inteiro maior ou igual a zero.'] } });
    if (total !== null && total < used) {
      throw new ApiError(`O total não pode ser menor que as licenças em uso (${used}). Desative agentes antes de reduzir.`, { status: 400, code: 'seat_total_below_used', fieldErrors: { total: [`O total não pode ser menor que as licenças em uso (${used}).`] } });
    }
    db.seatTotal = total;
    return licensesNow();
  });
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
    assertSeatFree();
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
    db.createdSeats.push(user.id);
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
    if (!suspended && u.suspended && u.role === 'agent') assertSeatFree(); // reativar ocupa um assento
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
