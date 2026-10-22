import type { Org } from '@/types/domain';
import type { CompanyDto } from './dto';

/**
 * Empresa (Company) -> Org. `details` = razão social, `notes` = observações. O backend não tem tags, grupo padrão nem
 * "acesso dos usuários" por empresa: `tags=[]`, `groupId` ausente e `userAccess='own_tickets'` são só padrões locais.
 */
export function mapCompany(dto: CompanyDto): Org {
  return {
    id: String(dto.id),
    name: dto.name,
    domains: dto.domains ?? [],
    tags: [],
    userAccess: 'own_tickets',
    details: dto.legal_name || undefined,
    notes: dto.notes || undefined,
    createdAt: dto.created_at,
    planId: dto.plan != null ? String(dto.plan) : undefined,
    planName: dto.plan_name ?? undefined,
  };
}
