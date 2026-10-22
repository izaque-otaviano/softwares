import type { Org, User } from '@/types/domain';
import type { SearchPreviewDto } from './dto';

/** Cliente da prévia `/search/` -> User parcial (o backend só traz id, nome, e-mail, empresa e se está ativo). */
export function mapSearchRequester(r: SearchPreviewDto['requesters'][number]): User {
  return {
    id: String(r.id),
    name: r.full_name,
    email: r.email,
    role: 'end_user',
    orgId: r.company_id != null ? String(r.company_id) : undefined,
    tags: [],
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    suspended: r.is_active === false,
  };
}

export function mapSearchCompany(c: SearchPreviewDto['companies'][number]): Org {
  return { id: String(c.id), name: c.name, domains: [], tags: [], userAccess: 'own_tickets' };
}
