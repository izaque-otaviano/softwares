import type { Priority } from './domain';

/** ---------- SLA e prazos ---------- */
export interface PriorityTarget {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
}

export interface SlaPolicy {
  id: string;
  name: string;
  /** Plano e equipe a que a política se aplica (ambos vazios = padrão global). */
  planId: string | null;
  planName: string | null;
  teamId: string | null;
  teamName: string | null;
  /** Metas gerais, em minutos. Existem no backend. */
  firstResponseMinutes: number;
  resolutionMinutes: number;
  useBusinessHours: boolean;
  active: boolean;
  /** Metas por prioridade: NÃO existem no backend, valem só neste navegador. */
  priorityTargets: Partial<Record<Priority, PriorityTarget>>;
}

export interface SlaPolicyInput {
  id?: string;
  name: string;
  planId: string | null;
  teamId: string | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  useBusinessHours: boolean;
  active: boolean;
  priorityTargets: Partial<Record<Priority, PriorityTarget>>;
}

export interface RefOption {
  id: string;
  name: string;
}

/** ---------- Calendários e feriados ---------- */
/** 0 = segunda ... 6 = domingo (convenção do backend). */
export interface WorkWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface Holiday {
  id: string;
  calendarId: string;
  /** AAAA-MM-DD */
  date: string;
  name: string;
  /** Vazios = dia inteiro fechado; ambos preenchidos = só atende nesta janela. */
  start: string | null;
  end: string | null;
  /** Repete todo ano: NÃO existe no backend, vale só neste navegador. */
  recurring: boolean;
}

export interface BusinessCalendar {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  windows: WorkWindow[];
  holidays: Holiday[];
}

export interface CalendarInput {
  id?: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  windows: WorkWindow[];
}

export interface HolidayInput {
  id?: string;
  calendarId: string;
  date: string;
  name: string;
  start: string | null;
  end: string | null;
  recurring: boolean;
}

/** ---------- Planos ---------- */
export type LimitPeriod = 'weekly' | 'monthly';

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  rank: number;
  /** Franquia de tickets (vazio = ilimitado). */
  ticketLimit: number | null;
  limitPeriod: string;
  /** Franquia mensal de horas de manutenção, em minutos (vazio = sem franquia). */
  monthlyMaintenanceMinutes: number | null;
  chatEnabled: boolean;
  chatConsumesQuota: boolean;
  companyCount: number;
}

export interface PlanInput {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  active: boolean;
  rank: number;
  ticketLimit: number | null;
  limitPeriod: string;
  monthlyMaintenanceMinutes: number | null;
  chatEnabled: boolean;
  chatConsumesQuota: boolean;
}

/** ---------- Backups ---------- */
export type BackupOrigin = 'manual' | 'agendado' | 'pre_restauracao';
export type JobStatus = 'pendente' | 'rodando' | 'concluido' | 'erro' | 'cancelado';
export type JobKind = 'backup' | 'restauracao';

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
  /** null = veio de fora da tela (timer do sistema, cron). */
  origin: BackupOrigin | null;
}

export interface BackupLogLine {
  at: string;
  level: string;
  message: string;
}

export interface BackupJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  statusLabel: string;
  step: string;
  progress: number | null;
  log: BackupLogLine[];
  error: string;
  origin: BackupOrigin;
  fileName: string;
  sizeBytes: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: string | null;
}

export interface BackupOverview {
  running: BackupJob | null;
  files: BackupFile[];
  recent: BackupJob[];
  directory: string;
  retentionDays: number;
}

export type BackupFrequency = 'diaria' | 'semanal';

export interface BackupSchedule {
  enabled: boolean;
  frequency: BackupFrequency;
  /** HH:MM */
  time: string;
  /** 0 = domingo ... 6 = sábado (convenção do cron do backend). Só na frequência semanal. */
  weekday: number | null;
  retentionDays: number;
  nextAt: string | null;
}

export type BackupScheduleInput = Omit<BackupSchedule, 'retentionDays' | 'nextAt'>;

/** ---------- Avisos ---------- */
export type AnnouncementKind = 'info' | 'urgent' | 'holiday' | 'vacation';
export type AudienceKind = 'all' | 'all_internal' | 'all_clients' | 'teams' | 'roles' | 'companies' | 'plans';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  startsAt: string;
  endsAt: string | null;
  pinned: boolean;
  active: boolean;
  audience: AudienceKind;
  targetRoles: string[];
  targetTeamIds: string[];
  targetCompanyIds: string[];
  targetPlanIds: string[];
  createdBy: string | null;
  dismissed: boolean;
  createdAt: string;
}

export interface AnnouncementInput {
  id?: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  startsAt: string;
  endsAt: string | null;
  pinned: boolean;
  active: boolean;
  audience: AudienceKind;
  targetRoles: string[];
  targetTeamIds: string[];
  targetCompanyIds: string[];
  targetPlanIds: string[];
}
