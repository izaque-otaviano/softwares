import type {
  Announcement,
  AnnouncementInput,
  BackupFile,
  BackupJob,
  BackupOrigin,
  BackupOverview,
  BackupSchedule,
  BackupScheduleInput,
  BusinessCalendar,
  Holiday,
  Plan,
  PlanInput,
  RefOption,
  SlaPolicy,
  WorkWindow,
} from '@/types/admin-a';

/** DTOs do backend Resolv para as telas de administração A (SLA, calendários, planos, backups, avisos). */
export interface SlaPolicyDto {
  id: number;
  name: string;
  plan: number | null;
  plan_name: string | null;
  team: number | null;
  team_name: string | null;
  first_response_minutes: number;
  resolution_minutes: number;
  use_business_hours: boolean;
  is_active: boolean;
}

export interface HolidayDto {
  id: number;
  calendar: number;
  date: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
}

export interface CalendarDto {
  id: number;
  name: string;
  timezone: string;
  is_default: boolean;
  workdays: { weekday: number; start: string; end: string }[];
  holidays: HolidayDto[];
}

export interface PlanDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  rank: number;
  default_ticket_limit: number | null;
  default_limit_period: string;
  monthly_maintenance_minutes: number | null;
  chat_enabled: boolean;
  chat_consumes_quota: boolean;
  company_count?: number;
}

export interface TeamRefDto {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface JobDto {
  id: number;
  status: string;
  status_label: string;
  etapa: string;
  progresso: number | null;
  log: { t: string; nivel: string; msg: string }[];
  erro: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by_name: string | null;
  tipo: string;
  origem: string;
  arquivo_nome: string;
  tamanho_bytes: number | null;
}

export interface BackupsDto {
  em_andamento: JobDto | null;
  arquivos: { nome: string; tamanho_bytes: number; criado_em: string; origem: string | null }[];
  recentes: JobDto[];
  diretorio: string;
  retencao_dias: number;
}

export interface ScheduleDto {
  ativo: boolean;
  frequencia: string;
  hora: string;
  dia_da_semana: number | null;
  retencao_dias: number;
  proximo_em: string | null;
}

export interface AnnouncementDto {
  id: number;
  title: string;
  body: string;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  is_pinned: boolean;
  is_active: boolean;
  audience_kind: string;
  target_roles: string[];
  target_teams: number[];
  target_companies: number[];
  target_plans: number[];
  created_by_name: string | null;
  dismissed: boolean;
  created_at: string;
}

const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

export function mapSlaPolicy(d: SlaPolicyDto): SlaPolicy {
  return {
    id: String(d.id),
    name: d.name,
    planId: d.plan === null ? null : String(d.plan),
    planName: d.plan_name,
    teamId: d.team === null ? null : String(d.team),
    teamName: d.team_name,
    firstResponseMinutes: d.first_response_minutes,
    resolutionMinutes: d.resolution_minutes,
    useBusinessHours: d.use_business_hours,
    active: d.is_active,
    priorityTargets: {},
  };
}

export const slaToDto = (i: { name: string; planId: string | null; teamId: string | null; firstResponseMinutes: number; resolutionMinutes: number; useBusinessHours: boolean; active: boolean }) => ({
  name: i.name.trim(),
  plan: i.planId === null ? null : Number(i.planId),
  team: i.teamId === null ? null : Number(i.teamId),
  first_response_minutes: i.firstResponseMinutes,
  resolution_minutes: i.resolutionMinutes,
  use_business_hours: i.useBusinessHours,
  is_active: i.active,
});

export function mapHoliday(d: HolidayDto): Holiday {
  return { id: String(d.id), calendarId: String(d.calendar), date: d.date, name: d.name, start: hhmm(d.start_time), end: hhmm(d.end_time), recurring: false };
}

export const sortWindows = (w: WorkWindow[]): WorkWindow[] => [...w].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));

export function mapCalendar(d: CalendarDto): BusinessCalendar {
  return {
    id: String(d.id),
    name: d.name,
    timezone: d.timezone,
    isDefault: d.is_default,
    windows: sortWindows(d.workdays.map((w) => ({ weekday: Number(w.weekday), start: w.start.slice(0, 5), end: w.end.slice(0, 5) }))),
    holidays: d.holidays.map(mapHoliday).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function mapPlan(d: PlanDto): Plan {
  return {
    id: String(d.id),
    slug: d.slug,
    name: d.name,
    description: d.description ?? '',
    active: d.is_active,
    rank: d.rank,
    ticketLimit: d.default_ticket_limit,
    limitPeriod: d.default_limit_period,
    monthlyMaintenanceMinutes: d.monthly_maintenance_minutes,
    chatEnabled: d.chat_enabled,
    chatConsumesQuota: d.chat_consumes_quota,
    companyCount: d.company_count ?? 0,
  };
}

export const planToDto = (i: PlanInput) => ({
  ...(i.slug ? { slug: i.slug } : {}),
  name: i.name.trim(),
  description: i.description,
  is_active: i.active,
  rank: i.rank,
  default_ticket_limit: i.ticketLimit,
  default_limit_period: i.limitPeriod,
  monthly_maintenance_minutes: i.monthlyMaintenanceMinutes,
  chat_enabled: i.chatEnabled,
  chat_consumes_quota: i.chatConsumesQuota,
});

export const mapRef = (d: TeamRefDto): RefOption => ({ id: String(d.id), name: d.name });

const ORIGINS: ReadonlySet<string> = new Set(['manual', 'agendado', 'pre_restauracao']);
const origin = (o: string | null): BackupOrigin | null => (o && ORIGINS.has(o) ? (o as BackupOrigin) : null);

export function mapJob(d: JobDto): BackupJob {
  return {
    id: String(d.id),
    kind: d.tipo === 'restauracao' ? 'restauracao' : 'backup',
    status: d.status as BackupJob['status'],
    statusLabel: d.status_label,
    step: d.etapa,
    progress: d.progresso,
    log: d.log.map((l) => ({ at: l.t, level: l.nivel, message: l.msg })),
    error: d.erro,
    origin: origin(d.origem) ?? 'manual',
    fileName: d.arquivo_nome,
    sizeBytes: d.tamanho_bytes,
    createdAt: d.created_at,
    startedAt: d.started_at,
    finishedAt: d.finished_at,
    requestedBy: d.requested_by_name,
  };
}

export function mapBackups(d: BackupsDto): BackupOverview {
  const files: BackupFile[] = d.arquivos.map((a) => ({ name: a.nome, sizeBytes: a.tamanho_bytes, createdAt: a.criado_em, origin: origin(a.origem) }));
  return { running: d.em_andamento ? mapJob(d.em_andamento) : null, files, recent: d.recentes.map(mapJob), directory: d.diretorio, retentionDays: d.retencao_dias };
}

export function mapSchedule(d: ScheduleDto): BackupSchedule {
  return { enabled: d.ativo, frequency: d.frequencia === 'semanal' ? 'semanal' : 'diaria', time: d.hora, weekday: d.dia_da_semana, retentionDays: d.retencao_dias, nextAt: d.proximo_em };
}

export const scheduleToDto = (i: BackupScheduleInput) => ({ ativo: i.enabled, frequencia: i.frequency, hora: i.time, dia_da_semana: i.frequency === 'semanal' ? i.weekday : null });

export function mapAnnouncement(d: AnnouncementDto): Announcement {
  return {
    id: String(d.id),
    title: d.title,
    body: d.body,
    kind: d.kind as Announcement['kind'],
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    pinned: d.is_pinned,
    active: d.is_active,
    audience: d.audience_kind as Announcement['audience'],
    targetRoles: d.target_roles ?? [],
    targetTeamIds: (d.target_teams ?? []).map(String),
    targetCompanyIds: (d.target_companies ?? []).map(String),
    targetPlanIds: (d.target_plans ?? []).map(String),
    createdBy: d.created_by_name,
    dismissed: d.dismissed,
    createdAt: d.created_at,
  };
}

export const announcementToDto = (i: AnnouncementInput) => ({
  title: i.title.trim(),
  body: i.body,
  kind: i.kind,
  starts_at: i.startsAt,
  ends_at: i.endsAt,
  is_pinned: i.pinned,
  is_active: i.active,
  audience_kind: i.audience,
  target_roles: i.audience === 'roles' ? i.targetRoles : [],
  target_teams: i.audience === 'teams' ? i.targetTeamIds.map(Number) : [],
  target_companies: i.audience === 'companies' ? i.targetCompanyIds.map(Number) : [],
  target_plans: i.audience === 'plans' ? i.targetPlanIds.map(Number) : [],
});
