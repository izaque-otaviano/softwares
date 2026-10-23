/** Formatos do backend Resolv (só os campos que o Helpdesk usa). Capturados do backend real: ver `../__fixtures__`. */

export type StageCategoryDto = 'new' | 'open' | 'pending_customer' | 'closed';
export type SlaStateDto = 'none' | 'ok' | 'at_risk' | 'met' | 'breached';

export interface StatusDto {
  id: number;
  name: string;
  slug: string;
  category: StageCategoryDto | string;
  category_label?: string;
  color: string;
  order: number;
  is_system: boolean;
  is_active: boolean;
  ticket_count?: number;
}

export interface TeamDto {
  id: number;
  name: string;
  slug: string;
  is_active?: boolean;
  order?: number;
  visibility?: string;
  internal_only?: boolean;
  supervisor?: number | null;
  supervisor_name?: string | null;
  agent_count?: number;
  ticket_count?: number;
}

export interface RosterTeamDto extends TeamDto {
  agents: UserDto[];
}

export interface RosterDto {
  teams: RosterTeamDto[];
}

export interface UserDto {
  id: number;
  email: string;
  full_name: string;
  kind: 'internal' | 'client' | string;
  internal_role?: string | null;
  client_role?: string | null;
  company?: number | null;
  company_name?: string | null;
  job_title?: string;
  phone?: string;
  phone_secondary?: string;
  is_active?: boolean;
  last_login?: string | null;
  last_seen_at?: string | null;
  invite_status?: string;
  team_ids?: number[];
  avatar_url?: string;
  custom_role_name?: string | null;
  /** Carimbos do cadastro (backend novo; ausentes em backend antigo). */
  created_at?: string;
  updated_at?: string;
}

export interface CompanyDto {
  id: number;
  name: string;
  legal_name?: string;
  tax_id?: string | null;
  slug?: string;
  plan?: number | null;
  plan_name?: string | null;
  is_active: boolean;
  timezone?: string;
  notes?: string;
  user_count?: number;
  created_at?: string;
  domains?: string[];
}

export interface TagDto {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface MacroDto {
  id: number;
  name: string;
  body: string;
  chat_name?: string;
  category?: number | null;
  category_name?: string | null;
  priority: string;
  assignee?: number | null;
  assignee_name?: string | null;
  tags: number[];
  is_active: boolean;
  order: number;
}

export interface SlaClockDto {
  due_at: string | null;
  state: SlaStateDto | string;
  minutes_left: number | null;
}

export interface TicketTeamDto {
  id: number;
  name: string;
  slug: string;
}

export interface TicketDto {
  id: number;
  reference: string;
  subject: string;
  status: StageCategoryDto | string;
  stage: number | null;
  stage_name?: string | null;
  stage_color?: string | null;
  priority: string;
  /** `question|incident|problem|task`; nulo = sem tipo. */
  type?: string | null;
  source: string;
  team: TicketTeamDto;
  requester_display: string;
  /** Id do solicitante; `null` quando o conteúdo é restrito (mesma máscara de `requester_display`). */
  requester_id?: number | null;
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_avatar?: string | null;
  company_name: string | null;
  /** Id da empresa; acompanha `company_name`. */
  company_id?: number | null;
  sla?: { first_response?: SlaClockDto; resolution?: SlaClockDto };
  tags: { id?: number; name: string; slug?: string; color?: string }[];
  content_hidden?: boolean;
  /** Formulário do ticket (o padrão vigente se não tem próprio); `null`/ausente para cliente. Vem na lista e no detalhe. */
  form_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentDto {
  id: number;
  filename: string;
  content_type?: string;
  size_bytes: number;
  url: string;
  scan_status?: string;
  is_downloadable?: boolean;
}

export interface MentionDto {
  key: string;
  type: 'user' | 'team' | string;
  id: number;
  name: string;
  is_active?: boolean;
}

export interface MessageDto {
  id: number;
  /** Id de quem escreveu; `null` em mensagem do sistema (ou autor que o usuário não pode ver). */
  author_id?: number | null;
  author_name: string;
  author_avatar: string | null;
  author_is_internal: boolean;
  body: string;
  is_public: boolean;
  source: 'web' | 'chat' | 'system' | string;
  is_first_response?: boolean;
  created_at: string;
  attachments: AttachmentDto[];
  mentions?: MentionDto[];
  edited_at: string | null;
  is_deleted: boolean;
  signature_html?: string;
}

export interface TicketEventDto {
  id: number;
  from_status: string | null;
  to_status: string | null;
  actor_name: string | null;
  is_reopen: boolean;
  is_automatic: boolean;
  note: string;
  created_at: string;
}

export interface TicketDetailDto extends TicketDto {
  /** Valores dos campos personalizados, por slug, só dos que têm valor. Só no DETALHE (a lista não traz); cliente recebe `{}`. */
  custom_fields?: Record<string, string | number | boolean | null>;
  messages: MessageDto[];
  events: TicketEventDto[];
  watchers: { id: number; name: string }[];
  /** Só equipe (cliente recebe `[]`). */
  followers?: { id: number; name: string; email: string; is_internal?: boolean }[];
  cc?: { id: number; name: string; email: string }[];
  /** Só o administrador abre ticket apagado; em ticket vivo vêm nulos. */
  deleted_at?: string | null;
  deleted_by_name?: string | null;
  requester: { id: number; name: string; email: string; ui_language?: string; timezone?: string | null } | null;
}

export interface PersonalViewDto {
  id: number;
  name: string;
  filters: Record<string, string>;
  position?: number;
  count?: number;
}

export interface SearchPreviewDto {
  tickets: { id: number; reference: string; subject: string; company_name: string | null; stage_name: string | null }[];
  companies: { id: number; name: string; slug?: string }[];
  requesters: { id: number; full_name: string; email: string; company_id: number | null; company_name: string | null; is_active: boolean }[];
}

export interface SummaryDto {
  visoes: Record<string, number>;
}

export interface PlanDto {
  id: number;
  slug: string;
  name: string;
  is_active: boolean;
  rank?: number;
}

/** `GET|PATCH /settings/licenses/`. `total`/`available` nulos = sem limite. */
export interface LicensesDto {
  total: number | null;
  used: number;
  available: number | null;
  unlimited: boolean;
}

/** `POST /tickets/{id}/ai-summary/`. */
export interface AiSummaryDto {
  summary: string;
  generated_at: string;
  provider: string;
  truncated: boolean;
}

/** `GET /settings/ticket-fields/`. */
export interface TicketFieldDto {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: string;
  options: { value: string; label: string }[];
  is_required: boolean;
  is_active: boolean;
  order: number;
  is_system: boolean;
  values_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface TicketFormFieldDto {
  field: number;
  slug: string;
  title: string;
  type: string;
  field_is_active: boolean;
  is_required: boolean;
  order: number;
}

/** `GET /settings/ticket-forms/`. */
export interface TicketFormDto {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  order: number;
  default_team: number | null;
  default_team_name: string | null;
  type: string | null;
  form_fields: TicketFormFieldDto[];
  ticket_count: number;
  created_at?: string;
  updated_at?: string;
}
