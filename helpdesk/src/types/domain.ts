export type StatusCategory = 'new' | 'open' | 'pending' | 'solved';

export interface TicketStatus {
  id: string;
  category: StatusCategory;
  agentName: string;
  agentDescription: string;
  endUserName: string;
  /** Chave de token (`new`, `open`, `hold`, `pending`, `solved`) ou qualquer cor CSS de status criado no Admin. Use sempre via StatusBadge/StatusDot. */
  color: string;
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent'; // Baixa, Normal, Alta, Urgente
export type TicketType = 'question' | 'incident' | 'problem' | 'task'; // Pergunta, Incidente, Problema, Tarefa

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'end_user' | 'agent' | 'admin';
  orgId?: string;
  tags: string[];
  language: string;
  timezone: string;
  details?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  suspended?: boolean;
  /** Contatos adicionais ("+ adicionar contato"). */
  extraEmails?: string[];
}

export interface Org {
  id: string;
  name: string;
  domains: string[];
  tags: string[];
  groupId?: string;
  userAccess: 'own_tickets' | 'org_tickets';
  details?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  agentIds: string[];
}

export interface Attachment {
  name: string;
  size: number;
}

export interface Comment {
  id: string;
  authorId: string;
  public: boolean;
  bodyHtml: string;
  channel: 'email' | 'web_form' | 'api';
  attachments: Attachment[];
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  authorId: 'system' | string;
  kind: 'notification' | 'sla' | 'field_change' | 'client_meta' | 'ai_triage';
  text: string;
  meta?: Record<string, string>;
  createdAt: string;
}

export type SlaState = 'ok' | 'warning' | 'breached' | 'met';

export interface TicketSla {
  name: string;
  target: 'first_reply' | 'resolution';
  dueAt: string;
  state: SlaState;
}

export interface Ticket {
  id: number;
  subject: string;
  requesterId: string;
  assigneeGroupId: string;
  assigneeId?: string;
  followerIds: string[];
  ccIds: string[];
  tags: string[];
  type?: TicketType;
  priority?: Priority;
  statusId: string;
  channel: 'email' | 'web_form';
  formId: string;
  /** resumo, tópico, sentimento, idioma + confianças */
  customFields: Record<string, string | undefined>;
  sla?: TicketSla;
  comments: Comment[];
  events: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export type ViewConditionField = 'assignee' | 'group' | 'status_category' | 'updated_within_hours';

export interface ViewCondition {
  field: ViewConditionField;
  operator: 'is' | 'is_not' | 'present' | 'not_present' | 'less_than';
  /** `assignee`: id do agente ou `me`; `status_category`: StatusCategory; `updated_within_hours`: número em texto. */
  value?: string;
}

export interface ViewConditions {
  /** Todas devem valer. */
  all: ViewCondition[];
  /** Pelo menos uma deve valer (ignorado se vazio). */
  any?: ViewCondition[];
}

export interface View {
  id: string;
  name: string;
  conditions: ViewConditions;
  groupBy?: 'statusCategory';
  columns: string[];
  countKey: string;
}

export interface MacroActions {
  status?: string;
  priority?: Priority;
  addTags?: string[];
  publicReply?: string;
  internalNote?: string;
}

export interface Macro {
  id: string;
  name: string;
  description?: string;
  availableTo: 'all' | 'group' | 'me';
  active: boolean;
  usage7d: number;
  actions: MacroActions;
}

export type ConditionOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'present'
  | 'not_present'
  | 'less_than'
  | 'greater_than';

export interface Condition {
  /** Ex.: `ticket.is_new`, `comment.is_public`, `ticket.status`, `ticket.priority`, `requester.role`. */
  field: string;
  operator: ConditionOperator;
  value?: string;
}

export type TriggerAction =
  | { kind: 'notify_email'; to: 'requester' | 'assignee' | 'cc' | 'followers'; subject: string; body: string }
  | { kind: 'set_status'; statusId: string }
  | { kind: 'set_priority'; priority: Priority }
  | { kind: 'add_tags'; tags: string[] }
  | { kind: 'assign_group'; groupId: string };

export interface Trigger {
  id: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
  fired7d: number;
  all: Condition[];
  any: Condition[];
  actions: TriggerAction[];
}

export interface TicketField {
  id: string;
  title: string;
  type: 'text' | 'textarea' | 'dropdown' | 'number' | 'system';
  /** Campos de sistema não podem ser removidos. */
  system: boolean;
  active: boolean;
  required: boolean;
  description?: string;
  options?: string[];
}

export interface SearchResults {
  tickets: Ticket[];
  users: User[];
  orgs: Org[];
}
