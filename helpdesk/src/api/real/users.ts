import type { User } from '@/types/domain';
import { ApiError } from '../errors';
import { db } from '../mock/db';
import * as mock from '../mock/users';
import type { UserFilter } from '../mock/users';
import { http } from './http';
import { layers, mirror, upsertInDb } from './local';
import { mapUser, normName, type UserDto } from './mappers';
import { getClientDtos, getClients, getStaff, getStaffDtos } from './refs';

/**
 * USUÁRIOS: clientes (`/settings/users/?kind=client`) e agentes/admins (`kind=internal`), carregados inteiros e
 * filtrados no navegador. Escrita REAL (só administrador): nome, e-mail, empresa, cargo (`details`), telefone e
 * suspender (`is_active`). Tags, notas, e-mails extras, idioma e fuso não existem no backend e ficam neste navegador.
 * "Apagar" desativa (o backend nunca apaga). Fundir segue local.
 */
const withExtras = (u: User): User => ({ ...u, ...layers.userExtras.get(u.id) });
const visible = (list: User[]): User[] => list.filter((u) => !layers.hiddenUsers.has(u.id)).map(withExtras);

async function everyone(opts: { clients: boolean; staff: boolean }): Promise<User[]> {
  const [clients, staff] = await Promise.all([opts.clients ? getClients() : [], opts.staff ? getStaff().catch(() => [] as User[]) : []]);
  const merged = layers.users.apply(visible([...staff, ...clients]));
  mirror.users(merged);
  return merged;
}

export async function listUsers(filter: UserFilter = {}): Promise<User[]> {
  const wantClients = !filter.role || filter.role === 'end_user';
  const wantStaff = !filter.role || filter.role !== 'end_user';
  const q = filter.query ? normName(filter.query) : '';
  return (await everyone({ clients: wantClients, staff: wantStaff })).filter(
    (u) =>
      (!filter.role || u.role === filter.role) &&
      (!filter.orgId || u.orgId === filter.orgId) &&
      (!q || normName(u.name).includes(q) || normName(u.email).includes(q)),
  );
}

export async function getUser(id: string): Promise<User> {
  const local = layers.users.get(id);
  if (local) return local;
  if (layers.users.isRemoved(id) || layers.hiddenUsers.has(id)) throw new ApiError('Usuário não encontrado.', { status: 404 });
  const known = (await everyone({ clients: true, staff: true }).catch(() => [])).find((u) => u.id === id);
  if (known) return known;
  return withExtras(mapUser(await http.get<UserDto>(`/settings/users/${encodeURIComponent(id)}/`)));
}

const invalidate = (): void => {
  getClientDtos.reset();
  getClients.reset();
  getStaffDtos.reset();
  getStaff.reset();
};

const EXTRA_KEYS = ['tags', 'notes', 'extraEmails', 'language', 'timezone'] as const;

export async function updateUser(id: string, patch: Partial<Omit<User, 'id'>>): Promise<User> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.full_name = patch.name.trim();
  if (patch.email !== undefined) body.email = patch.email.trim();
  if (patch.orgId !== undefined) body.company = Number(patch.orgId);
  if (patch.details !== undefined) body.job_title = patch.details;
  if (patch.phone !== undefined) body.phone = patch.phone;
  if (patch.suspended !== undefined) body.is_active = !patch.suspended;
  const dto = Object.keys(body).length > 0 ? await http.patch<UserDto>(`/settings/users/${id}/`, body) : await http.get<UserDto>(`/settings/users/${id}/`);
  invalidate();
  const extras: Partial<User> = { ...layers.userExtras.get(id) };
  for (const k of EXTRA_KEYS) if (patch[k] !== undefined) (extras as Record<string, unknown>)[k] = patch[k];
  layers.userExtras.set(id, extras);
  return withExtras(mapUser(dto));
}

/**
 * Cria o CLIENTE: `POST /settings/users/` (kind `client`). O backend exige a organização e ao menos um telefone;
 * sem eles recusa ANTES da chamada com a mensagem certa. Nasce sem senha e o backend envia o convite por e-mail.
 */
export async function createUser(input: Parameters<typeof mock.createUser>[0]): Promise<User> {
  if (!input.orgId) throw new ApiError('Escolha a organização do cliente: no backend todo cliente pertence a uma empresa. Nada foi criado.');
  if (!input.phone?.trim()) throw new ApiError('Informe um telefone do cliente: o backend exige ao menos um. Nada foi criado.');
  const dto = await http.post<UserDto>('/settings/users/', {
    email: input.email.trim(),
    full_name: input.name.trim(),
    kind: 'client',
    company: Number(input.orgId),
    phone: input.phone.trim(),
    ...(input.details ? { job_title: input.details } : {}),
  });
  invalidate();
  const user = mapUser(dto);
  layers.userExtras.set(user.id, { tags: input.tags ?? [], notes: input.notes, language: input.language ?? 'pt-BR', timezone: input.timezone ?? 'America/Sao_Paulo' });
  return withExtras(user);
}

/** "Apagar" = desativar no backend; o usuário some das listas desta sessão (volta como suspenso ao recarregar). */
export async function deleteUser(id: string): Promise<void> {
  await http.delete(`/settings/users/${id}/`);
  invalidate();
  layers.hiddenUsers.add(id);
}

/** Fusão NÃO existe no backend: segue local (capabilities.merge = 'local'). */
export async function mergeUsers(sourceId: string, targetId: string): Promise<User> {
  upsertInDb(db.users, await getUser(sourceId));
  upsertInDb(db.users, await getUser(targetId));
  const saved = await mock.mergeUsers(sourceId, targetId);
  layers.users.remove(sourceId);
  layers.users.record(saved);
  layers.mergedUsers.set(sourceId, targetId);
  return saved;
}

export type { UserFilter };
