import type { Macro } from '@/types/domain';
import { ApiError } from '../errors';
import * as mock from '../mock/macros';
import { http } from './http';
import { layers, mirror } from './local';
import { htmlToMarkdown, mapMacro, type MacroDto } from './mappers';
import { getMacros } from './refs';
import { ensureTags } from './tags';

/**
 * MACROS: `/settings/ticket-macros/` (leitura interna; escrita só administrador). O corpo é markdown no backend
 * (HTML do editor -> markdown na ida; markdown -> HTML sanitizado na volta). Prioridade, etiquetas e ativo vão ao
 * backend; descrição, "disponível para", ação de status e nota interna não existem lá e ficam neste navegador.
 */
const withExtras = (m: Macro): Macro => ({ ...m, ...layers.macroExtras.get(m.id), actions: { ...m.actions, ...layers.macroExtras.get(m.id)?.actions } });

export async function listMacros(): Promise<Macro[]> {
  const merged = (await getMacros()).map(withExtras);
  mirror.macros(merged);
  return merged;
}

export async function getMacro(id: string): Promise<Macro> {
  const found = (await listMacros()).find((m) => m.id === id);
  if (!found) throw new ApiError('Macro não encontrada.', { status: 404 });
  return found;
}

export async function saveMacro(macro: Parameters<typeof mock.saveMacro>[0]): Promise<Macro> {
  const markdown = (macro.bodyMarkdown ?? htmlToMarkdown(macro.actions.publicReply ?? '')).trim();
  if (!markdown) throw new ApiError('A macro precisa de um texto de resposta: o backend exige o corpo. Nada foi salvo.');
  const tags = await ensureTags(macro.actions.addTags);
  const ids = tags.filter((t) => macro.actions.addTags?.some((n) => n.trim().toLowerCase() === t.name.toLowerCase())).map((t) => t.id);
  const body = { name: macro.name.trim(), body: markdown, priority: macro.actions.priority ?? '', tags: ids, is_active: macro.active };
  const dto = macro.id ? await http.patch<MacroDto>(`/settings/ticket-macros/${macro.id}/`, body) : await http.post<MacroDto>('/settings/ticket-macros/', body);
  getMacros.reset();
  const saved = mapMacro(dto, tags);
  layers.macroExtras.set(saved.id, {
    description: macro.description,
    availableTo: macro.availableTo,
    actions: { status: macro.actions.status, internalNote: macro.actions.internalNote },
  });
  return withExtras(saved);
}

export async function deleteMacro(id: string): Promise<void> {
  await http.delete(`/settings/ticket-macros/${id}/`);
  getMacros.reset();
  layers.macroExtras.delete(id);
}
