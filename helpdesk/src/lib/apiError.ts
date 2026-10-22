import { ApiError } from '@/api/errors';

/** Mensagem para o usuário: a do backend já vem em pt-BR (inclui a frase de permissão do 403); senão a padrão. */
export function errMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}
