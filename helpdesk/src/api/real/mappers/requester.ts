import type { User } from '@/types/domain';

/** Minúsculas, sem acentos e sem espaços repetidos (casamento de nomes). */
export function normName(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Casamento SEGURO de solicitante: a lista de tickets do backend traz só `requester_display` (nome) e `company_name`,
 * sem `requester_id`/`company_id`. Só devolve um id quando exatamente UM cliente tem esse nome (e, se a empresa vier,
 * a mesma empresa). Nome repetido, sem correspondência ou ticket mascarado ("Usuário protegido") devolve `undefined`:
 * quem chama resolve pelo detalhe do ticket (`requester.id`).
 */
export function matchRequesterId(ticket: { requester_display: string; company_name: string | null; content_hidden?: boolean }, clients: User[], orgNameById: (orgId?: string) => string | undefined): string | undefined {
  if (ticket.content_hidden) return undefined;
  const name = normName(ticket.requester_display);
  if (!name) return undefined;
  const company = normName(ticket.company_name);
  const hits = clients.filter((u) => normName(u.name) === name && (!company || normName(orgNameById(u.orgId)) === company));
  return hits.length === 1 ? hits[0]!.id : undefined;
}

/**
 * Autor de mensagem: o backend não manda `author_id` (só `author_name`). Casa pelo nome dentro do conjunto certo
 * (agentes se `author_is_internal`, clientes se não) e só aceita casamento ÚNICO; o solicitante do ticket tem
 * prioridade para mensagens de cliente. Sem casamento seguro devolve `name:<nome>` (nunca colide com um id real).
 */
export function resolveAuthorId(
  msg: { author_name: string; author_is_internal: boolean; source?: string },
  ctx: { requesterId?: string; requesterName?: string; staff: User[]; clients: User[] },
): string {
  if (msg.source === 'system') return 'system';
  const name = normName(msg.author_name);
  if (!msg.author_is_internal) {
    if (ctx.requesterId && name && name === normName(ctx.requesterName)) return ctx.requesterId;
    const hits = ctx.clients.filter((u) => normName(u.name) === name);
    return hits.length === 1 ? hits[0]!.id : `name:${msg.author_name}`;
  }
  const hits = ctx.staff.filter((u) => normName(u.name) === name);
  return hits.length === 1 ? hits[0]!.id : `name:${msg.author_name}`;
}
