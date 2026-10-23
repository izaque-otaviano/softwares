import { IS_REAL } from '@/api/mode';
import { useSession } from '@/store/useSession';

/**
 * Permissões da sessão (`me.permissions` do backend). No modo mock não há papéis: tudo é permitido.
 * `anyOf` aceita uma permissão ou uma lista (basta uma).
 */
export function userCan(user: { permissions: string[] } | null | undefined, anyOf: string | readonly string[], real: boolean = IS_REAL): boolean {
  if (!real) return true;
  const wanted = typeof anyOf === 'string' ? [anyOf] : anyOf;
  return Boolean(user) && wanted.some((p) => user!.permissions.includes(p));
}

/** Criar, editar, ativar e excluir macros: o backend aceita `macro.manage` OU `settings.manage` (administrador). */
export const MACRO_WRITE: readonly string[] = ['macro.manage', 'settings.manage'];
/** Administração da conta; também é a permissão que apaga e restaura tickets (não existe `ticket.delete`). */
export const SETTINGS_MANAGE = 'settings.manage';
/** Editar propriedades do ticket (responsável, status por coluna, etiquetas) já na criação. */
export const TICKET_EDIT_PROPERTIES = 'ticket.edit_properties';

/** Hook: o usuário logado tem a permissão? */
export function useCan(anyOf: string | readonly string[]): boolean {
  const user = useSession((s) => s.user);
  return userCan(user, anyOf);
}

/** Versão não reativa, para stores e funções puras. */
export const can = (anyOf: string | readonly string[]): boolean => userCan(useSession.getState().user, anyOf);
