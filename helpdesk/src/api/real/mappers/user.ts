import type { User } from '@/types/domain';
import type { UserDto } from './dto';

/** `kind=client` -> end_user; internos: admin -> admin; os demais (supervisor, agente, agente leve) -> agent. */
export function mapRole(dto: Pick<UserDto, 'kind' | 'internal_role'>): User['role'] {
  if (dto.kind === 'client') return 'end_user';
  return dto.internal_role === 'admin' ? 'admin' : 'agent';
}

export const INTERNAL_ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Agente',
  light_agent: 'Agente leve',
};

/**
 * Usuário do Resolv -> User. O backend não expõe tags, detalhes/notas, e-mails extras, idioma
 * nem fuso do usuário: ficam vazios/padrão (`createdAt`/`updatedAt` vêm do cadastro; ausentes em backend antigo, e a tela mostra "-").
 * `lastSeenAt`: último acesso, senão último login.
 */
export function mapUser(dto: UserDto): User {
  return {
    id: String(dto.id),
    name: dto.full_name?.trim() || dto.email,
    email: dto.email,
    role: mapRole(dto),
    orgId: dto.company != null ? String(dto.company) : undefined,
    tags: [],
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    details: dto.job_title || undefined,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    lastSeenAt: dto.last_seen_at ?? dto.last_login ?? undefined,
    suspended: dto.is_active === false,
    internalRole: dto.internal_role ?? undefined,
    avatarUrl: dto.avatar_url || null,
    phone: dto.phone || undefined,
  };
}
