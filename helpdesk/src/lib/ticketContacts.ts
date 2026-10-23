import type { Ticket, TicketContact } from '@/types/domain';

type Lookup = (id: string) => { name: string; email: string } | undefined;

/**
 * CC de terceiros do ticket. Modo real: a lista do servidor (`ccList`, com o id do registro de CC). Sem ela (mock),
 * deriva de `ccIds`: cada valor é um e-mail ou o id de um usuário conhecido (vira o e-mail dele).
 */
export function ticketCcList(t: Pick<Ticket, 'ccList' | 'ccIds'>, lookup: Lookup): TicketContact[] {
  if (t.ccList) return t.ccList;
  return t.ccIds.map((v, i) => {
    const u = lookup(v);
    return { id: `cc${i}-${v}`, name: u?.name ?? '', email: u?.email ?? v };
  });
}

/** Seguidores com nome e e-mail: a lista do servidor ou, sem ela, os ids resolvidos no diretório. */
export function ticketFollowerList(t: Pick<Ticket, 'followerList' | 'followerIds'>, lookup: Lookup): TicketContact[] {
  if (t.followerList) return t.followerList;
  return t.followerIds.map((id) => {
    const u = lookup(id);
    return { id, name: u?.name ?? id, email: u?.email ?? '' };
  });
}

export const MAX_CC = 20;
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
