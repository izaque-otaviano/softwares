export type StatusCategory = 'new' | 'open' | 'pending' | 'solved';

export interface TicketStatus {
  id: string;
  category: StatusCategory;
  agentName: string;
  agentDescription: string;
  endUserName: string;
  /** Chave de token (`new`, `open`, `hold`, `pending`, `solved`) ou qualquer cor CSS de status criado no Admin. Use sempre via StatusBadge/StatusDot. */
  color: string;
  /** Ausente = ativo. Status desativado some dos menus de escolha, mas continua pintando tickets que já o usam. */
  active?: boolean;
  /** Status de fábrica (um por categoria): não pode ser desativado nem apagado. Ausente = usa `SYSTEM_STATUS_IDS` (mock). */
  system?: boolean;
  /** Só modo real: quantos tickets usam este status (o backend recusa trocar a categoria de um status em uso). */
  ticketCount?: number;
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
  /** Ausente no mock e em backend antigo que não expõe `created_at`/`updated_at` do usuário. */
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  suspended?: boolean;
  /** Papel detalhado do backend (admin, supervisor, agent, light_agent...). Só modo real. */
  internalRole?: string;
  /** Foto do usuário no backend (só modo real). */
  avatarUrl?: string | null;
  /** Contatos adicionais ("+ adicionar contato"). */
  extraEmails?: string[];
  /** Telefone (só modo real: o backend exige ao menos um para cliente). */
  phone?: string;
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
  /** Só modo real: plano da empresa (obrigatório ao criar no backend). */
  planId?: string;
  planName?: string;
}

export interface Group {
  id: string;
  name: string;
  agentIds: string[];
  /** Slug da equipe no backend (`me.teams` traz slugs). Só modo real. */
  slug?: string;
  /** Equipe inativa no backend (só modo real). */
  inactive?: boolean;
}

export interface Attachment {
  name: string;
  size: number;
  /** Download autenticado no backend (`/api/v1/attachments/{id}/`). Só modo real. */
  url?: string;
  /** Anexo ainda em varredura/quarentena: o download responde 409. Só modo real. */
  downloadable?: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  public: boolean;
  bodyHtml: string;
  channel: 'email' | 'web_form' | 'api' | 'chat' | 'system';
  attachments: Attachment[];
  createdAt: string;
  /**
   * Só modo real: `authorId` vem de `author_id` do backend (ver api/real/mappers/ticket.ts). Sem `author_id` (autor oculto), `authorId` vira `name:<nome>` e a tela usa estes campos.
   */
  authorName?: string;
  authorInternal?: boolean;
  authorAvatarUrl?: string | null;
  editedAt?: string | null;
  deleted?: boolean;
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
  /** Só modo real: referência legível ("TD-00001"). */
  reference?: string;
  /** Só modo real: a lista do backend traz nomes (e não ids) de solicitante/empresa/responsável. */
  requesterName?: string;
  companyName?: string;
  /** Só modo real: id da empresa do solicitante (`company_id`); ausente se o ticket é restrito ou sem empresa. */
  orgId?: string;
  assigneeName?: string;
  /** Só modo real: canal original do backend (`web`, `chat`, `internal`); `channel` é a aproximação do Helpdesk. */
  source?: 'web' | 'chat' | 'internal';
  /** Só modo real: `false` na lista (sem mensagens/eventos); `true` depois de `getTicket`. Ausente = mock (completo). */
  detailed?: boolean;
  /** Só modo real: campos da última edição que o backend não tem e valem só neste navegador (assunto, tipo, CC...). */
  localFields?: string[];
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
  /**
   * Só modo real: parâmetros do `GET /tickets/` que definem a visão NO SERVIDOR (`{view:'sem-atendimento'}`, filtros
   * de visão pessoal...). Com `query`, a lista vem do servidor; sem ela, `conditions` avalia no navegador.
   */
  query?: Record<string, string>;
  /** Só modo real: de onde vem (sistema do backend, visão pessoal ou do Helpdesk). */
  origin?: 'helpdesk' | 'system' | 'personal';
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
  /** Só modo real: o corpo da resposta como o backend o guarda (markdown), para editar sem perder a formatação. */
  bodyMarkdown?: string;
  createdAt?: string;
  updatedAt?: string;
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
  updatedAt?: string;
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
  /** Última modificação (ISO). */
  updatedAt?: string;
}

export interface SearchResults {
  tickets: Ticket[];
  users: User[];
  orgs: Org[];
}
