/** Tipos das telas de auditoria, retenção, LGPD, notificações e segurança da conta (já no formato do front). */

export interface PageOf<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  /** Só a central de notificações: total de não lidas do usuário. */
  unreadCount?: number;
}

export interface PageQuery {
  limit?: number;
  offset?: number;
}

/* ------------------------------ Auditoria -------------------------------- */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'assign'
  | 'login'
  | 'config_change'
  | 'export'
  | 'anonymize'
  | 'scan_blocked';

export interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorName: string;
  action: string;
  /** Nome legível do tipo de objeto ("usuário", "pedido LGPD"). */
  targetLabel: string;
  objectId: string;
  summary: string;
  /** `{campo: [antes, depois]}` quando o backend registra a mudança. */
  changes: Record<string, unknown>;
  /** Só quando o backend entrega. */
  ip?: string;
  createdAt: string;
}

export interface AuditLogFilters extends PageQuery {
  action?: string;
  actor?: string;
  /** `YYYY-MM-DD`: a partir desta data. O backend não tem "até". */
  from?: string;
}

export interface TicketAccessEntry {
  id: string;
  ticketId: string;
  ticketReference: string;
  team: string;
  userId?: string;
  userName: string;
  granted: boolean;
  /** detail | export | api | kanban */
  context: string;
  ip?: string;
  createdAt: string;
}

export interface TicketAccessFilters extends PageQuery {
  ticket?: string;
  user?: string;
  deniedOnly?: boolean;
}

/* ------------------------------- Retenção -------------------------------- */

export interface RetentionPolicyResult {
  key: string;
  matched: number;
  applied: number;
  sample: string[];
  error?: string;
}

export interface RetentionRun {
  id: string;
  /** `true` = simulação (nada foi apagado). */
  dryRun: boolean;
  status: 'running' | 'done' | 'failed';
  policies: RetentionPolicyResult[];
  error?: string;
  finishedAt?: string;
  triggeredByName: string;
  totalMatched: number;
  totalApplied: number;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  isReviewed: boolean;
  createdAt: string;
}

/* --------------------------------- LGPD ---------------------------------- */

export type DsrKind = 'export' | 'anonymize' | 'rectify';
export type DsrStatus = 'pending' | 'approved' | 'running' | 'done' | 'failed' | 'rejected';

export interface DataSubjectRequest {
  id: string;
  kind: DsrKind;
  status: DsrStatus;
  subjectUserId?: string;
  subjectUserName?: string;
  subjectCompanyId?: string;
  subjectCompanyName?: string;
  executedByName?: string;
  executedAt?: string;
  verifiedAt?: string;
  verificationNote: string;
  dueAt?: string;
  isOverdue: boolean;
  daysLeft?: number;
  hasExport: boolean;
  /** O que foi anonimizado (retorno do backend). */
  result: Record<string, unknown>;
  error: string;
  notes: string;
  rejectionReason: string;
  createdAt: string;
}

export interface RedactionCandidate {
  model: 'ticket' | 'message' | string;
  pk: string;
  field: string;
  reference: string;
  /** Rótulo do padrão que casou (CPF, e-mail...). Nunca o trecho. */
  pattern: string;
}

export interface NewDataSubjectRequest {
  kind: DsrKind;
  subjectUserId?: string;
  subjectCompanyId?: string;
  notes?: string;
}

/* ------------------------------ Notificações ----------------------------- */

export interface NotificationKindOption {
  value: string;
  label: string;
}

export interface NotificationPrefs {
  kinds: NotificationKindOption[];
  inApp: Record<string, boolean>;
  email: Record<string, boolean>;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** Caminho no app (ex.: /tickets/24) ou vazio. */
  url: string;
  ticketId?: string;
  actorName?: string;
  readAt?: string;
  createdAt: string;
}

/* -------------------------------- Segurança ------------------------------ */

export type TwoFactorMethod = '' | 'email' | 'totp';

export interface TwoFactorStatus {
  method: TwoFactorMethod;
  /** Ativação iniciada e ainda sem confirmar. */
  pending: TwoFactorMethod;
  /** O que vale no login (inclui o e-mail imposto pelo administrador). */
  effective: TwoFactorMethod;
  required: boolean;
}

export interface TwoFactorSetup {
  method: TwoFactorMethod;
  /** Só no aplicativo autenticador. */
  secret?: string;
  otpauthUri?: string;
  /** E-mail: o código foi enviado. */
  sent?: boolean;
}

export interface AccountSession {
  key: string;
  browser: string;
  userAgent: string;
  ip: string;
  startedAt?: string;
  expiresAt: string;
  current: boolean;
}

export interface AccessEvent {
  kind: string;
  label: string;
  ip: string;
  browser: string;
  createdAt: string;
  success: boolean;
}

export interface AccessHistory {
  events: AccessEvent[];
  logins: AccessEvent[];
  sessions: AccountSession[];
  sessionLimit: number;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}
