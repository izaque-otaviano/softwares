import type {
  AccessEvent,
  AccessHistory,
  AccountSession,
  AuditLogEntry,
  DataSubjectRequest,
  DsrKind,
  DsrStatus,
  NotificationItem,
  NotificationPrefs,
  PageOf,
  RedactionCandidate,
  RetentionPolicyResult,
  RetentionRun,
  TicketAccessEntry,
  TwoFactorMethod,
  TwoFactorSetup,
  TwoFactorStatus,
} from '@/types/admin-b';

/** Mapeadores puros (DTO do backend Resolv -> tipos do front) das telas de auditoria, LGPD, notificações e segurança. */

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opt = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v));

export interface PaginatedDto<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
  unread_count?: number;
}

export function mapPage<D, T>(dto: PaginatedDto<D>, map: (d: D) => T, query: { limit: number; offset: number }): PageOf<T> {
  return {
    items: dto.results.map(map),
    total: dto.count,
    limit: query.limit,
    offset: query.offset,
    unreadCount: typeof dto.unread_count === 'number' ? dto.unread_count : undefined,
  };
}

/* ------------------------------ Auditoria -------------------------------- */

export interface AuditLogDto {
  id: number;
  actor: number | null;
  actor_name: string | null;
  action: string;
  target_type?: string;
  target_label: string;
  object_id: string;
  changes: Record<string, unknown> | null;
  summary: string;
  ip_address: string | null;
  created_at: string;
}

export const mapAuditLog = (d: AuditLogDto): AuditLogEntry => ({
  id: String(d.id),
  actorId: d.actor === null || d.actor === undefined ? undefined : String(d.actor),
  actorName: !d.actor_name || d.actor_name === '—' ? 'Sistema' : d.actor_name,
  action: d.action,
  targetLabel: d.target_label,
  objectId: str(d.object_id),
  summary: str(d.summary),
  changes: d.changes ?? {},
  ip: opt(d.ip_address),
  createdAt: d.created_at,
});

export interface TicketAccessDto {
  id: number;
  ticket: number;
  ticket_reference: string;
  team: string | null;
  user: number | null;
  user_name: string | null;
  was_granted: boolean;
  context: string;
  ip_address: string | null;
  created_at: string;
}

export const mapTicketAccess = (d: TicketAccessDto): TicketAccessEntry => ({
  id: String(d.id),
  ticketId: String(d.ticket),
  ticketReference: d.ticket_reference,
  team: str(d.team),
  userId: d.user === null || d.user === undefined ? undefined : String(d.user),
  userName: !d.user_name || d.user_name === '—' ? 'Usuário removido' : d.user_name,
  granted: d.was_granted,
  context: d.context,
  ip: opt(d.ip_address),
  createdAt: d.created_at,
});

/* ------------------------------- Retenção -------------------------------- */

export interface RetentionPolicyDto {
  matched?: number;
  applied?: number;
  sample?: unknown[];
  error?: string;
}

export interface RetentionRunDto {
  id: number;
  dry_run: boolean;
  status: 'running' | 'done' | 'failed';
  results: Record<string, RetentionPolicyDto> | null;
  error: string;
  finished_at: string | null;
  triggered_by_name: string | null;
  total_matched: number;
  total_applied: number;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  is_reviewed: boolean;
  created_at: string;
}

export const mapRetentionPolicy = (key: string, d: RetentionPolicyDto): RetentionPolicyResult => ({
  key,
  matched: Number(d.matched ?? 0),
  applied: Number(d.applied ?? 0),
  sample: (d.sample ?? []).map(String),
  error: opt(d.error),
});

export const mapRetentionRun = (d: RetentionRunDto): RetentionRun => ({
  id: String(d.id),
  dryRun: d.dry_run,
  status: d.status,
  policies: Object.entries(d.results ?? {}).map(([k, v]) => mapRetentionPolicy(k, v)),
  error: opt(d.error),
  finishedAt: opt(d.finished_at),
  triggeredByName: d.triggered_by_name ?? 'agendamento',
  totalMatched: d.total_matched,
  totalApplied: d.total_applied,
  reviewedByName: opt(d.reviewed_by_name),
  reviewedAt: opt(d.reviewed_at),
  reviewNote: opt(d.review_note),
  isReviewed: d.is_reviewed,
  createdAt: d.created_at,
});

/* --------------------------------- LGPD ---------------------------------- */

export interface DataSubjectRequestDto {
  id: number;
  kind: DsrKind;
  status: DsrStatus;
  subject_user: number | null;
  subject_user_name: string | null;
  subject_company: number | null;
  subject_company_name: string | null;
  executed_by_name: string | null;
  executed_at: string | null;
  verified_at: string | null;
  verification_note: string;
  due_at: string | null;
  is_overdue: boolean;
  days_left: number | null;
  has_export: boolean;
  result: Record<string, unknown> | null;
  error: string;
  notes: string;
  rejection_reason: string;
  created_at: string;
}

export const mapDsr = (d: DataSubjectRequestDto): DataSubjectRequest => ({
  id: String(d.id),
  kind: d.kind,
  status: d.status,
  subjectUserId: d.subject_user === null || d.subject_user === undefined ? undefined : String(d.subject_user),
  subjectUserName: opt(d.subject_user_name),
  subjectCompanyId: d.subject_company === null || d.subject_company === undefined ? undefined : String(d.subject_company),
  subjectCompanyName: opt(d.subject_company_name),
  executedByName: opt(d.executed_by_name),
  executedAt: opt(d.executed_at),
  verifiedAt: opt(d.verified_at),
  verificationNote: str(d.verification_note),
  dueAt: opt(d.due_at),
  isOverdue: Boolean(d.is_overdue),
  daysLeft: typeof d.days_left === 'number' ? d.days_left : undefined,
  hasExport: Boolean(d.has_export),
  result: d.result ?? {},
  error: str(d.error),
  notes: str(d.notes),
  rejectionReason: str(d.rejection_reason),
  createdAt: d.created_at,
});

export interface RedactionCandidateDto {
  model: string;
  pk: number | string;
  field: string;
  reference: string;
  pattern: string;
}

export const mapRedactionCandidate = (d: RedactionCandidateDto): RedactionCandidate => ({
  model: d.model,
  pk: String(d.pk),
  field: d.field,
  reference: str(d.reference),
  pattern: d.pattern,
});

/* ------------------------------ Notificações ----------------------------- */

export interface NotificationPrefsDto {
  in_app: Record<string, boolean>;
  email: Record<string, boolean>;
  kinds: { value: string; label: string }[];
}

export const mapPrefs = (d: NotificationPrefsDto): NotificationPrefs => ({
  kinds: d.kinds,
  inApp: { ...d.in_app },
  email: { ...d.email },
});

export interface NotificationDto {
  id: number;
  kind: string;
  title: string;
  body: string;
  url: string;
  ticket_id: number | null;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
}

export const mapNotification = (d: NotificationDto): NotificationItem => ({
  id: String(d.id),
  kind: d.kind,
  title: d.title,
  body: str(d.body),
  url: str(d.url),
  ticketId: d.ticket_id === null || d.ticket_id === undefined ? undefined : String(d.ticket_id),
  actorName: opt(d.actor_name),
  readAt: opt(d.read_at),
  createdAt: d.created_at,
});

/* -------------------------------- Segurança ------------------------------ */

const METHODS: readonly string[] = ['', 'email', 'totp'];
const method = (v: unknown): TwoFactorMethod => (METHODS.includes(String(v ?? '')) ? (String(v ?? '') as TwoFactorMethod) : '');

export interface TwoFactorStatusDto {
  method: string;
  pending: string;
  effective: string;
  required: boolean;
}

export const mapTwoFactorStatus = (d: TwoFactorStatusDto): TwoFactorStatus => ({
  method: method(d.method),
  pending: method(d.pending),
  effective: method(d.effective),
  required: Boolean(d.required),
});

export interface TwoFactorSetupDto {
  method: string;
  secret?: string;
  otpauth_uri?: string;
  sent?: boolean;
}

export const mapTwoFactorSetup = (d: TwoFactorSetupDto): TwoFactorSetup => ({
  method: method(d.method),
  secret: d.secret,
  otpauthUri: d.otpauth_uri,
  sent: d.sent,
});

/** Leitura curta do user-agent ("Chrome · Linux"), como o backend faz em `browser_of`. */
export function browserOf(userAgent: string): string {
  if (!userAgent) return 'Desconhecido';
  const ua = userAgent;
  const browser = ua.includes('Edg') ? 'Edge' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : '';
  const os =
    ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : ua.includes('Android') ? 'Android' : ua.includes('Mac OS X') ? 'macOS' : ua.includes('Windows') ? 'Windows' : ua.includes('Linux') ? 'Linux' : '';
  if (!browser && !os) return ua.slice(0, 60);
  return [browser, os].filter(Boolean).join(' · ');
}

export interface LiveSessionDto {
  key: string;
  user_agent: string;
  ip: string;
  started_at: string | null;
  expires_at: string;
  current: boolean;
}

export const mapLiveSession = (d: LiveSessionDto): AccountSession => ({
  key: d.key,
  browser: browserOf(d.user_agent),
  userAgent: d.user_agent,
  ip: str(d.ip),
  startedAt: opt(d.started_at),
  expiresAt: d.expires_at,
  current: d.current,
});

export interface AccessEventDto {
  kind: string;
  kind_label: string;
  ip: string;
  browser: string;
  created_at: string;
  success: boolean;
}

export interface AccessHistoryDto {
  events: AccessEventDto[];
  logins: AccessEventDto[];
  sessions: { key: string; browser: string; ip: string; user_agent: string; started_at: string | null; expires_at: string; current: boolean }[];
  session_limit: number;
}

export const mapAccessEvent = (d: AccessEventDto): AccessEvent => ({
  kind: d.kind,
  label: d.kind_label,
  ip: str(d.ip),
  browser: str(d.browser),
  createdAt: d.created_at,
  success: d.success,
});

export const mapAccessHistory = (d: AccessHistoryDto): AccessHistory => ({
  events: d.events.map(mapAccessEvent),
  logins: d.logins.map(mapAccessEvent),
  sessions: d.sessions.map((s) => ({
    key: s.key,
    browser: s.browser,
    userAgent: s.user_agent,
    ip: str(s.ip),
    startedAt: opt(s.started_at),
    expiresAt: s.expires_at,
    current: s.current,
  })),
  sessionLimit: d.session_limit,
});
