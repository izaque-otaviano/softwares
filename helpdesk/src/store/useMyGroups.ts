import { useMemo } from 'react';
import type { Group } from '@/types/domain';
import { useRefData } from './useRefData';
import { useSession } from './useSession';

/**
 * Grupos do agente logado. No mock `SessionUser.teams` já são ids de grupo; no real são os SLUGS de `me.teams`
 * (o backend não manda ids ali): casa por `Group.slug` (ou `Group.id`) com os grupos de `useRefData`.
 */
export function selectMyGroups(teams: string[], groups: Group[]): Group[] {
  return groups.filter((g) => teams.includes(g.id) || (g.slug !== undefined && teams.includes(g.slug)));
}

export function useMyGroups(): Group[] {
  const teams = useSession((s) => s.user?.teams);
  const groups = useRefData((s) => s.groups);
  return useMemo(() => selectMyGroups(teams ?? [], groups), [teams, groups]);
}
