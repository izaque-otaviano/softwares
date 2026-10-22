import type { Group } from '@/types/domain';
import type { RosterDto, TeamDto } from './dto';

/** Equipe (Team) do Resolv = Grupo do Helpdesk. `agentIds` só vem do roster (`/settings/teams/roster/`). */
export function mapTeam(dto: TeamDto, agentIds: string[] = []): Group {
  return { id: String(dto.id), name: dto.name, agentIds, slug: dto.slug, inactive: dto.is_active === false ? true : undefined };
}

export function mapRoster(roster: RosterDto): Group[] {
  return [...roster.teams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((t) => mapTeam(t, t.agents.map((a) => String(a.id))));
}
