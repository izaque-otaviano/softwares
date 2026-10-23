import type { TicketForm } from '@/types/domain';
import type { FormInput, FormPatch } from '@/types/customFields';
import { http } from './http';
import { formBody, mapForm, type TicketFormDto } from './mappers';
import { listAll } from './refs';

/** Formulários de ticket: `/settings/ticket-forms/`. Qualquer agente lê; escrever exige `settings.manage`. */
const PATH = '/settings/ticket-forms/';

export async function listForms(): Promise<TicketForm[]> {
  return (await listAll<TicketFormDto>(PATH, {}, 200)).map(mapForm).sort((a, b) => a.order - b.order);
}

export async function createForm(input: FormInput): Promise<TicketForm> {
  return mapForm(await http.post<TicketFormDto>(PATH, formBody(input)));
}

export async function updateForm(id: string, patch: FormPatch): Promise<TicketForm> {
  return mapForm(await http.patch<TicketFormDto>(`${PATH}${id}/`, formBody(patch)));
}

/** 409 `form_in_use` (há tickets: desative) ou `default_form_required` (é o padrão: escolha outro antes). */
export async function deleteForm(id: string): Promise<void> {
  await http.delete(`${PATH}${id}/`);
}

export async function reorderForms(ids: string[]): Promise<TicketForm[]> {
  const res = await http.post<TicketFormDto[]>(`${PATH}reorder/`, { ids: ids.map(Number) });
  return (Array.isArray(res) ? res : []).map(mapForm);
}

/** `POST clone/`: copia campos, obrigatoriedade, equipe e tipo padrão; nunca vira o padrão. Sem nome: "Cópia de X". */
export async function cloneForm(id: string, name?: string): Promise<TicketForm> {
  return mapForm(await http.post<TicketFormDto>(`${PATH}${id}/clone/`, name?.trim() ? { name: name.trim() } : {}));
}
