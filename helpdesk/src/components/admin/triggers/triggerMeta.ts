import { CATEGORY_LABEL, PRIORITY_LABEL, TYPE_LABEL } from '@/lib/status';
import type { Condition, ConditionOperator, Group, TicketStatus, Trigger, TriggerAction } from '@/types/domain';

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  is: 'É',
  is_not: 'Não é',
  contains: 'Contém',
  not_contains: 'Não contém',
  present: 'Está preenchido',
  not_present: 'Não está preenchido',
  less_than: 'Menor que',
  greater_than: 'Maior que',
};

export const NO_VALUE_OPERATORS: ConditionOperator[] = ['present', 'not_present'];

export interface Option {
  value: string;
  label: string;
}

export interface FieldMeta {
  id: string;
  label: string;
  operators: ConditionOperator[];
  /** Opções fixas para o valor; ausente = texto livre. */
  options?: (lookups: Lookups) => Option[];
}

export interface Lookups {
  statuses: TicketStatus[];
  groups: Group[];
}

const YES_NO = (): Option[] => [
  { value: 'true', label: 'Sim' },
  { value: 'false', label: 'Não' },
];
const fromLabels = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }));
const IS: ConditionOperator[] = ['is', 'is_not'];
const TEXT: ConditionOperator[] = ['contains', 'not_contains', 'is', 'is_not', 'present', 'not_present'];

export const FIELDS: FieldMeta[] = [
  { id: 'ticket.is_new', label: 'Ticket: é novo', operators: ['is'], options: YES_NO },
  { id: 'comment.is_public', label: 'Comentário: é público', operators: ['is'], options: YES_NO },
  { id: 'comment.text', label: 'Comentário: texto', operators: TEXT },
  { id: 'ticket.subject', label: 'Ticket: assunto', operators: TEXT },
  { id: 'ticket.status', label: 'Ticket: status', operators: IS, options: ({ statuses }) => statuses.map((s) => ({ value: s.id, label: s.agentName })) },
  { id: 'ticket.status_category', label: 'Ticket: categoria do status', operators: IS, options: () => fromLabels(CATEGORY_LABEL) },
  { id: 'ticket.priority', label: 'Ticket: prioridade', operators: [...IS, 'present', 'not_present'], options: () => fromLabels(PRIORITY_LABEL) },
  { id: 'ticket.type', label: 'Ticket: tipo', operators: [...IS, 'present', 'not_present'], options: () => fromLabels(TYPE_LABEL) },
  { id: 'ticket.group', label: 'Ticket: grupo', operators: [...IS, 'present', 'not_present'], options: ({ groups }) => groups.map((g) => ({ value: g.id, label: g.name })) },
  { id: 'ticket.assignee', label: 'Ticket: atribuído', operators: ['present', 'not_present'] },
  { id: 'ticket.assignee_changed', label: 'Ticket: atribuição mudou', operators: ['is'], options: YES_NO },
  { id: 'ticket.tags', label: 'Ticket: tags', operators: ['contains', 'not_contains', 'present', 'not_present'] },
  { id: 'ticket.channel', label: 'Ticket: canal', operators: IS, options: () => [{ value: 'email', label: 'E-mail' }, { value: 'web_form', label: 'Formulário web' }] },
  { id: 'requester.role', label: 'Solicitante: função', operators: IS, options: () => [{ value: 'end_user', label: 'Usuário final' }, { value: 'agent', label: 'Agente' }, { value: 'admin', label: 'Administrador' }] },
  { id: 'requester.language', label: 'Solicitante: idioma', operators: TEXT },
  { id: 'requester.tags', label: 'Solicitante: tags', operators: ['contains', 'not_contains', 'present', 'not_present'] },
];

export const fieldMeta = (id: string): FieldMeta | undefined => FIELDS.find((f) => f.id === id);

export function blankCondition(): Condition {
  return { field: 'ticket.is_new', operator: 'is', value: 'true' };
}

/** Condição coerente ao trocar de campo: primeiro operador válido e primeiro valor das opções. */
export function conditionForField(fieldId: string, lookups: Lookups): Condition {
  const meta = fieldMeta(fieldId);
  const operator = meta?.operators[0] ?? 'is';
  const first = meta?.options?.(lookups)[0]?.value;
  return { field: fieldId, operator, value: NO_VALUE_OPERATORS.includes(operator) ? undefined : (first ?? '') };
}

/* ------------------------------- ações ---------------------------------- */

export type ActionKind = TriggerAction['kind'];

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  notify_email: 'Notificar por › E-mail do usuário',
  set_status: 'Ticket › Definir status',
  set_priority: 'Ticket › Definir prioridade',
  add_tags: 'Ticket › Adicionar tags',
  assign_group: 'Ticket › Atribuir ao grupo',
};

export const RECIPIENT_OPTIONS: Option[] = [
  { value: 'requester', label: 'Solicitante' },
  { value: 'assignee', label: 'Agente atribuído' },
  { value: 'cc', label: 'Usuários em cópia' },
  { value: 'followers', label: 'Seguidores' },
];

export function blankAction(kind: ActionKind, lookups: Lookups): TriggerAction {
  switch (kind) {
    case 'notify_email':
      return { kind, to: 'requester', subject: '[#{{ticket.id}}] {{ticket.title}}', body: 'Olá {{ticket.requester.first_name}},\n\n' };
    case 'set_status':
      return { kind, statusId: lookups.statuses[0]?.id ?? 'open' };
    case 'set_priority':
      return { kind, priority: 'normal' };
    case 'add_tags':
      return { kind, tags: [] };
    case 'assign_group':
      return { kind, groupId: lookups.groups[0]?.id ?? '' };
  }
}

export const PLACEHOLDERS = ['{{ticket.id}}', '{{ticket.title}}', '{{ticket.requester.first_name}}', '{{ticket.latest_comment}}'];

export const DEFAULT_CATEGORIES = ['Notificações', 'Automação de atendimento'];

export function blankTrigger(): Omit<Trigger, 'id' | 'fired7d'> {
  return {
    name: '',
    description: '',
    category: 'Notificações',
    active: true,
    all: [{ field: 'ticket.is_new', operator: 'is', value: 'true' }],
    any: [],
    actions: [],
  };
}
