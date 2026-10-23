import { ApiError } from '../../errors';

/**
 * Mensagens claras (pt-BR) para as falhas de apagar, restaurar e resumir por IA. Funções puras: recebem o `ApiError`
 * já montado por `toApiError` e devolvem outro com a frase final, preservando `status`, `code` e `retryAfter`.
 */

const keep = (e: ApiError, message: string): ApiError =>
  new ApiError(message, { status: e.status, code: e.code, fieldErrors: e.fieldErrors, body: e.body, retryAfter: e.retryAfter });

const asApi = (e: unknown): ApiError | null => (e instanceof ApiError ? e : null);

/** O `detail` do backend (pt-BR) sem o prefixo de permissão que `toApiError` põe nos 403. */
const detailOf = (e: ApiError): string => {
  const body = e.body as { detail?: unknown } | undefined;
  return typeof body?.detail === 'string' ? body.detail.trim() : '';
};

/** `DELETE /tickets/{id}/`: 403 (só quem tem `settings.manage`), 404 (já apagado/fora do escopo), 409 `ticket_conflict` (horas lançadas). */
export function deleteTicketError(e: unknown, id: number): ApiError {
  const err = asApi(e);
  if (!err) return new ApiError(`Não foi possível apagar o ticket #${id}.`);
  if (err.status === 403) return keep(err, `Você não tem permissão para apagar tickets. Só administradores podem apagar o ticket #${id}.`);
  if (err.status === 404) return keep(err, `O ticket #${id} não foi encontrado: ele pode já ter sido apagado ou você não tem acesso a ele.`);
  if (err.status === 409) {
    const why = detailOf(err);
    return keep(err, `O ticket #${id} não pode ser apagado${why ? `. ${why.replace(/[.!?]*$/, '.')}` : ': ele tem horas de manutenção lançadas.'}`);
  }
  if (err.status === 0 || (err.status ?? 0) >= 500) return keep(err, `Não foi possível apagar o ticket #${id}: ${err.message}`);
  return keep(err, `Não foi possível apagar o ticket #${id}. ${err.message}`);
}

/** `POST /tickets/{id}/restore/`: 403, 404 (não está apagado), 409 `ticket_conflict` (passou de 30 dias). */
export function restoreTicketError(e: unknown, id: number): ApiError {
  const err = asApi(e);
  if (!err) return new ApiError(`Não foi possível restaurar o ticket #${id}.`);
  if (err.status === 403) return keep(err, 'Você não tem permissão para restaurar tickets. Só administradores podem fazer isso.');
  if (err.status === 404) return keep(err, `O ticket #${id} não está apagado ou não foi encontrado.`);
  if (err.status === 409) {
    const why = detailOf(err);
    return keep(err, why ? `Não foi possível restaurar o ticket #${id}. ${why}` : `O ticket #${id} foi apagado há mais de 30 dias e não pode mais ser restaurado.`);
  }
  return keep(err, `Não foi possível restaurar o ticket #${id}. ${err.message}`);
}

export const AI_NOT_CONFIGURED = 'O resumo por IA não está configurado nesta conta.';

/** `POST /tickets/{id}/ai-summary/`: 503 `ai_not_configured` (esperado, sem chave), 502 provedor, 429 teto de 20/h, 403 cliente/restrito, 404. */
export function aiSummaryError(e: unknown): ApiError {
  const err = asApi(e);
  if (!err) return new ApiError('Não foi possível gerar o resumo.');
  if (err.status === 503) return keep(err, AI_NOT_CONFIGURED);
  if (err.status === 502) return keep(err, 'O provedor de IA não respondeu agora. Tente gerar o resumo de novo em instantes.');
  if (err.status === 429) {
    const wait = err.retryAfter ? ` Tente de novo em ${err.retryAfter >= 90 ? `${Math.ceil(err.retryAfter / 60)} min` : `${err.retryAfter} s`}.` : ' Tente de novo mais tarde.';
    return keep(err, `Você atingiu o limite de resumos por IA (20 por hora).${wait}`);
  }
  if (err.status === 403) return keep(err, 'Você não tem permissão para gerar o resumo deste ticket.');
  if (err.status === 404) return keep(err, 'Ticket não encontrado.');
  return err;
}

/** Campo de e-mail do CC: 400 `{email:[...]}` ou `{detail}` (solicitante, limite de 20). */
export function ccError(e: unknown): ApiError {
  const err = asApi(e);
  if (!err) return new ApiError('Não foi possível adicionar o CC.');
  if (err.status === 403) return keep(err, 'Você não tem permissão para alterar o CC deste ticket.');
  if (err.status === 404) return keep(err, 'Ticket não encontrado.');
  return err;
}
