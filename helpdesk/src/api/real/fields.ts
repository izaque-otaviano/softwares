import type { TicketField } from '@/types/domain';
import type { FieldInput, FieldPatch } from '@/types/customFields';
import { ApiError } from '../errors';
import { http } from './http';
import { fieldBody, mapField, type TicketFieldDto } from './mappers';
import { listAll } from './refs';

/**
 * Campos personalizados (só equipe): `/settings/ticket-fields/`. Qualquer agente lê; escrever exige `settings.manage`
 * (403 vira a frase padrão de permissão). Os campos padrão do front (assunto, responsável, campos de IA...) NÃO vêm
 * daqui: ficam em `lib/systemFields.ts`.
 */
const PATH = '/settings/ticket-fields/';

export async function listFields(): Promise<TicketField[]> {
  return (await listAll<TicketFieldDto>(PATH, {}, 200)).map(mapField).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function createField(input: FieldInput): Promise<TicketField> {
  return mapField(await http.post<TicketFieldDto>(PATH, fieldBody(input)));
}

export async function updateField(id: string, patch: FieldPatch): Promise<TicketField> {
  return mapField(await http.patch<TicketFieldDto>(`${PATH}${id}/`, fieldBody(patch)));
}

export const setFieldActive = (id: string, active: boolean): Promise<TicketField> => updateField(id, { active });

/** 409 `field_in_use`: o campo já teve valor em algum ticket (desative em vez de apagar). */
export async function deleteField(id: string): Promise<void> {
  await http.delete(`${PATH}${id}/`);
}

/** `{ids}`: os informados ficam no início, na ordem; o servidor devolve a lista inteira. */
export async function reorderFields(ids: string[]): Promise<TicketField[]> {
  const res = await http.post<TicketFieldDto[] | { results: TicketFieldDto[] }>(`${PATH}reorder/`, { ids: ids.map(Number) });
  const list = Array.isArray(res) ? res : (res?.results ?? []);
  if (!Array.isArray(list)) throw new ApiError('Resposta inesperada ao reordenar os campos.');
  return list.map(mapField);
}
