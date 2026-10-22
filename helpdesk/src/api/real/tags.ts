import { ApiError } from '../errors';
import { hasRealPermission } from './auth';
import { http } from './http';
import type { TagDto } from './mappers';
import { getTags } from './refs';

const noPermission = (name: string): string => `A etiqueta "${name}" ainda não existe e só administradores podem criar etiquetas. Escolha uma existente ou peça a um administrador. Nada foi alterado.`;

/**
 * Garante que as etiquetas (por NOME) existam no backend e devolve a lista completa. Etiqueta nova só quem tem
 * `settings.manage` cria (administrador); sem permissão recusa ANTES de qualquer outra chamada, dizendo qual faltou.
 */
export async function ensureTags(names: string[] | undefined): Promise<TagDto[]> {
  let tags = await getTags();
  if (!names?.length) return tags;
  const missingIn = (list: TagDto[]) => {
    const have = new Set(list.map((t) => t.name.trim().toLowerCase()));
    return [...new Set(names.map((n) => n.trim()).filter((n) => n && !have.has(n.toLowerCase())))];
  };
  let missing = missingIn(tags);
  if (missing.length === 0) return tags;
  // O cache de 30 s pode estar velho (alguém criou a etiqueta agora): confere antes de tentar criar.
  tags = await getTags(true);
  missing = missingIn(tags);
  if (missing.length === 0) return tags;
  for (const name of missing) {
    if (!hasRealPermission('settings.manage')) throw new ApiError(noPermission(name), { status: 403 });
    try {
      await http.post('/settings/tags/', { name });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        throw new ApiError(noPermission(name), { status: 403, code: e.code });
      }
      throw e;
    }
  }
  getTags.reset();
  return getTags(true);
}
