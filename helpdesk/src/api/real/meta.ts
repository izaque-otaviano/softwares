import type { Group, TicketField, TicketStatus } from '@/types/domain';
import * as mock from '../mock/meta';
import { http } from './http';
import { layers, mirror } from './local';
import { mapStatus, statusColorToHex, toBackendCategory, type StatusDto } from './mappers';
import { getGroups, getStatuses } from './refs';

/** META: grupos = equipes (`/settings/teams/roster/`), status = stages (`/settings/statuses/`, leitura E escrita reais). */
export async function listGroups(): Promise<Group[]> {
  // Equipe desativada não recebe tickets (o backend recusa): fica fora dos seletores; a tela de Grupos a mostra como inativa.
  const groups = (await getGroups()).filter((g) => !g.inactive);
  mirror.groups(groups);
  return groups;
}

/** Campos do status que o backend não tem (nome para o usuário final, descrição) ficam só neste navegador. */
const withExtras = (s: TicketStatus): TicketStatus => ({ ...s, ...layers.statusExtras.get(s.id) });

export async function listStatuses(): Promise<TicketStatus[]> {
  const list = (await getStatuses()).map(withExtras);
  mirror.statuses(list);
  return list;
}

/** Campos de ticket: o backend não tem campos personalizados (capabilities.customFields = 'local'). */
export const listFields = (): Promise<TicketField[]> => mock.listFields();

/**
 * Cria (sem `id`) ou edita um status REAL (`POST`/`PATCH /settings/statuses/`; só administrador: 403 vira mensagem de
 * permissão). Nome e cor vão ao backend; a categoria só na criação (e em edição de status personalizado); `endUserName`
 * e `agentDescription` não existem lá e ficam neste navegador. Desativar = `is_active:false` (nunca apaga).
 */
export async function saveStatus(status: Omit<TicketStatus, 'id'> & { id?: string }): Promise<TicketStatus> {
  const body: Record<string, unknown> = { name: status.agentName.trim(), color: statusColorToHex(status.color), is_active: status.active !== false };
  let dto: StatusDto;
  if (status.id) {
    const current = (await getStatuses()).find((s) => s.id === status.id);
    if (current && !current.system && current.category !== status.category) body.category = toBackendCategory(status.category);
    dto = await http.patch<StatusDto>(`/settings/statuses/${status.id}/`, body);
  } else {
    dto = await http.post<StatusDto>('/settings/statuses/', { ...body, category: toBackendCategory(status.category) });
  }
  getStatuses.reset();
  const saved = mapStatus(dto);
  if (status.endUserName !== saved.agentName || status.agentDescription) {
    layers.statusExtras.set(saved.id, { endUserName: status.endUserName, agentDescription: status.agentDescription });
  } else {
    layers.statusExtras.delete(saved.id);
  }
  return withExtras(saved);
}
