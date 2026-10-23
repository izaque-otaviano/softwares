import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Announcement, AnnouncementKind, AudienceKind, RefOption } from '@/types/admin-a';

export const KIND_LABEL: Record<AnnouncementKind, string> = { info: 'Informativo', urgent: 'Urgente', holiday: 'Feriado', vacation: 'Férias da equipe' };

export const AUDIENCE_LABEL: Record<AudienceKind, string> = {
  all: 'Todos',
  all_internal: 'Todos os internos',
  all_clients: 'Todos os clientes',
  teams: 'Equipes específicas',
  roles: 'Papéis específicos',
  companies: 'Empresas específicas',
  plans: 'Planos específicos',
};

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'agent', label: 'Agente' },
];

export type AnnouncementState = 'vigente' | 'agendado' | 'encerrado' | 'desativado';
export const STATE_LABEL: Record<AnnouncementState, string> = { vigente: 'Vigente', agendado: 'Agendado', encerrado: 'Encerrado', desativado: 'Desativado' };

export function stateOf(a: Announcement, now: number = Date.now()): AnnouncementState {
  if (!a.active) return 'desativado';
  if (new Date(a.startsAt).getTime() > now) return 'agendado';
  if (a.endsAt && new Date(a.endsAt).getTime() < now) return 'encerrado';
  return 'vigente';
}

const names = (ids: string[], refs: RefOption[]) => ids.map((id) => refs.find((r) => r.id === id)?.name ?? `#${id}`);

export function audienceSummary(a: Announcement, refs: { teams: RefOption[]; companies: RefOption[]; plans: RefOption[] }): string {
  const base = AUDIENCE_LABEL[a.audience];
  const detail =
    a.audience === 'teams' ? names(a.targetTeamIds, refs.teams)
    : a.audience === 'companies' ? names(a.targetCompanyIds, refs.companies)
    : a.audience === 'plans' ? names(a.targetPlanIds, refs.plans)
    : a.audience === 'roles' ? a.targetRoles.map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r)
    : [];
  return detail.length ? `${base}: ${detail.join(', ')}` : base;
}

export const whenText = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—');
