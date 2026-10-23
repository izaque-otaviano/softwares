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
  /** Formulário do ticket (`form_id`; o padrão vigente quando o ticket não tem um próprio). Vazio = desconhecido. */
  formId: string;
  /** Campos de IA (resumo, tópico, sentimento, idioma + confianças): continuam locais, não são campos personalizados do backend. */
  customFields: Record<string, string | undefined>;
  /**
   * Valores dos campos personalizados (só equipe), por slug: `custom_fields` do detalhe, só dos campos com valor.
   * Ausente = ainda não carregado (a LISTA do backend não traz valores; só o detalhe).
   */
  fieldValues?: Record<string, FieldValue>;
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
  /** Só modo real: campos da última edição que o backend não tem e valem só neste navegador (assunto, solicitante, campos personalizados). */
  localFields?: string[];
  /** CC de terceiros do ticket (`GET /tickets/{id}/` -> `cc`); só equipe. `id` é o do registro de CC, não de usuário. */
  ccList?: TicketContact[];
  /** Seguidores com e-mail (`followers`); só equipe. `followerIds` continua sendo a lista de ids. */
  followerList?: TicketContact[];
  /** Ticket apagado (exclusão lógica): o detalhe só chega ao administrador, com quando e quem apagou. */
  deletedAt?: string;
  deletedByName?: string;
}

/** Pessoa/e-mail ligada ao ticket (CC de terceiro ou seguidor). */
export interface TicketContact {
  id: string;
  name: string;
  email: string;
  /** Só seguidor: usuário interno. */
  internal?: boolean;
}

/** Resumo de IA de um ticket (`POST /tickets/{id}/ai-summary/`). Não é gravado no servidor nem no front. */
export interface AiSummary {
  summary: string;
  generatedAt: string;
  provider: string;
  /** O servidor cortou a conversa (só as mensagens mais recentes foram enviadas ao provedor). */
  truncated: boolean;
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

/** Tipos de campo personalizado (v1). */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'checkbox' | 'dropdown';
export const FIELD_TYPES: readonly FieldType[] = ['text', 'textarea', 'number', 'date', 'checkbox', 'dropdown'];

/** Valor de um campo personalizado: texto/parágrafo/data (AAAA-MM-DD)/opção = string, número = number, checkbox = boolean. */
export type FieldValue = string | number | boolean;

export interface FieldOption {
  /** Valor guardado nos tickets: estável mesmo que o rótulo mude. */
  value: string;
  label: string;
  /** Só no editor do Admin: opção ainda não salva (renomear muda o valor junto). */
  fresh?: boolean;
}

export interface TicketField {
  /** Backend: id numérico em texto. Mock: o próprio slug. Campos de sistema do front: chave fixa (`subject`...). */
  id: string;
  /** Chave estável usada em `custom_fields` (nasce do título e não muda). Ausente nos campos de sistema do front. */
  slug?: string;
  title: string;
  type: FieldType | 'system';
  /** Campos padrão do front (assunto, responsável, campos de IA...): aparecem na lista, sem edição. */
  system: boolean;
  active: boolean;
  required: boolean;
  description?: string;
  /** Só dropdown, em ordem. */
  options?: FieldOption[];
  /** Posição na lista de campos. */
  order?: number;
  /** Quantos tickets têm valor neste campo (campo usado não pode ser apagado, só desativado). */
  valuesCount?: number;
  /** Última modificação (ISO). */
  updatedAt?: string;
}

/** Campo dentro de um formulário: a ordem da lista é a ordem de exibição. */
export interface FormFieldItem {
  fieldId: string;
  slug: string;
  title: string;
  type: FieldType;
  /** O campo foi desativado depois de entrar no formulário. */
  fieldActive: boolean;
  /** Obrigatório NESTE formulário (além do `required` do próprio campo). */
  required: boolean;
}

/** Formulário de ticket: lista ordenada de campos + equipe e tipo padrão. */
export interface TicketForm {
  id: string;
  name: string;
  description: string;
  active: boolean;
  isDefault: boolean;
  order: number;
  defaultTeamId?: string;
  defaultTeamName?: string;
  defaultType?: TicketType;
  ticketCount: number;
  fields: FormFieldItem[];
}

export interface SearchResults {
  tickets: Ticket[];
  users: User[];
  orgs: Org[];
}
