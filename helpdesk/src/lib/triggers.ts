import type {
  AuditEvent,
  Condition,
  Group,
  Priority,
  Ticket,
  TicketStatus,
  Trigger,
  TriggerAction,
  User,
} from '@/types/domain';

/** Tudo o que o motor precisa saber sobre o evento que está sendo avaliado. Puro: sem acesso a store, API ou relógio. */
export interface TriggerContext {
  /** Ticket já com as mudanças aplicadas (estado depois do envio). */
  ticket: Ticket;
  isNew: boolean;
  /** Comentário enviado agora; ausente se o envio só mudou campos. */
  comment?: { public: boolean; bodyHtml: string };
  requester?: User;
  assignee?: User;
  statuses: TicketStatus[];
  groups?: Group[];
  /** Quem fez a alteração (não recebe notificação de atribuição). */
  actorId?: string;
  /** O atribuído mudou neste envio. */
  assigneeChanged?: boolean;
  now?: Date;
}

/** Mudanças que os gatilhos pedem sobre o ticket (mesma forma de `TicketPatch`). */
export interface TriggerPatch {
  statusId?: string;
  priority?: Priority;
  tags?: string[];
  assigneeGroupId?: string;
}

export interface TriggerRunResult {
  patch: TriggerPatch;
  events: AuditEvent[];
  /** Ids dos gatilhos que dispararam, na ordem. */
  fired: string[];
}

const strip = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Valor textual do campo; `undefined` = campo vazio. */
export function fieldValue(field: string, ctx: TriggerContext): string | string[] | undefined {
  const { ticket } = ctx;
  switch (field) {
    case 'ticket.is_new':
      return String(ctx.isNew);
    case 'ticket.id':
      return String(ticket.id);
    case 'ticket.subject':
      return ticket.subject;
    case 'ticket.status':
      return ticket.statusId;
    case 'ticket.status_category':
      return ctx.statuses.find((s) => s.id === ticket.statusId)?.category;
    case 'ticket.priority':
      return ticket.priority;
    case 'ticket.type':
      return ticket.type;
    case 'ticket.group':
      return ticket.assigneeGroupId || undefined;
    case 'ticket.assignee':
      return ticket.assigneeId;
    case 'ticket.assignee_changed':
      return String(Boolean(ctx.assigneeChanged));
    case 'ticket.tags':
      return ticket.tags;
    case 'ticket.channel':
      return ticket.channel;
    case 'comment.is_public':
      return String(ctx.comment?.public === true);
    case 'comment.text':
      return ctx.comment ? strip(ctx.comment.bodyHtml) : undefined;
    case 'requester.role':
      return ctx.requester?.role;
    case 'requester.org':
      return ctx.requester?.orgId;
    case 'requester.tags':
      return ctx.requester?.tags;
    case 'requester.language':
      return ctx.requester?.language;
    default:
      return undefined;
  }
}

const norm = (s: string): string => s.toLocaleLowerCase('pt-BR');

export function evaluateCondition(condition: Condition, ctx: TriggerContext): boolean {
  const actual = fieldValue(condition.field, ctx);
  const expected = condition.value ?? '';
  const list = Array.isArray(actual) ? actual : actual === undefined ? [] : [actual];
  const empty = list.length === 0 || (list.length === 1 && list[0] === '');
  switch (condition.operator) {
    case 'present':
      return !empty;
    case 'not_present':
      return empty;
    case 'is':
      return list.some((v) => norm(v) === norm(expected));
    case 'is_not':
      return !list.some((v) => norm(v) === norm(expected));
    case 'contains':
      return list.some((v) => norm(v).includes(norm(expected)));
    case 'not_contains':
      return !list.some((v) => norm(v).includes(norm(expected)));
    case 'less_than':
      return list.some((v) => Number(v) < Number(expected));
    case 'greater_than':
      return list.some((v) => Number(v) > Number(expected));
    default:
      return false;
  }
}

/** `all` = todas valem; `any` = ao menos uma vale (ignorado se vazio). Gatilho sem nenhuma condição nunca dispara. */
export function triggerMatches(trigger: Trigger, ctx: TriggerContext): boolean {
  if (trigger.all.length === 0 && trigger.any.length === 0) return false;
  const allOk = trigger.all.every((c) => evaluateCondition(c, ctx));
  const anyOk = trigger.any.length === 0 || trigger.any.some((c) => evaluateCondition(c, ctx));
  return allOk && anyOk;
}

/** Substitui `{{ticket.id}}`, `{{ticket.title}}`, `{{ticket.requester.first_name}}`, `{{ticket.latest_comment}}`... */
export function renderTemplate(template: string, ctx: TriggerContext): string {
  const vars: Record<string, string> = {
    'ticket.id': String(ctx.ticket.id),
    'ticket.title': ctx.ticket.subject,
    'ticket.requester.name': ctx.requester?.name ?? '',
    'ticket.requester.first_name': ctx.requester?.name.split(' ')[0] ?? '',
    'ticket.assignee.name': ctx.assignee?.name ?? '',
    'ticket.latest_comment': ctx.comment ? strip(ctx.comment.bodyHtml) : '',
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

const RECIPIENT_LABEL = { requester: 'Cliente', assignee: 'Agente', cc: 'Cópia', followers: 'Seguidores' } as const;

let seq = 0;

function recipientsOf(action: Extract<TriggerAction, { kind: 'notify_email' }>, ctx: TriggerContext): number {
  switch (action.to) {
    case 'requester':
      return ctx.requester ? 1 : 0;
    case 'assignee':
      return ctx.assignee && ctx.assignee.id !== ctx.actorId ? 1 : 0;
    case 'cc':
      return ctx.ticket.ccIds.length;
    case 'followers':
      return ctx.ticket.followerIds.length;
  }
}

/**
 * Executa as ações de um gatilho que casou. Notificações viram `AuditEvent` do autor `system`; as demais ações
 * entram no `patch` acumulado (e já valem para os gatilhos seguintes, como no Zendesk).
 */
function runActions(trigger: Trigger, ctx: TriggerContext, patch: TriggerPatch, events: AuditEvent[]): void {
  const createdAt = (ctx.now ?? new Date()).toISOString();
  for (const action of trigger.actions) {
    switch (action.kind) {
      case 'notify_email': {
        if (recipientsOf(action, ctx) === 0) break;
        const label = RECIPIENT_LABEL[action.to];
        const who = action.to === 'requester' ? ` #${ctx.ticket.requesterId}` : action.to === 'assignee' ? ` #${ctx.ticket.assigneeId ?? ''}` : '';
        events.push({
          id: `trg-${trigger.id}-${ctx.ticket.id}-${++seq}`,
          authorId: 'system',
          kind: 'notification',
          text: `Notificação por e-mail ${label}${who} — Gatilho ${trigger.name}`,
          meta: {
            triggerId: trigger.id,
            Gatilho: trigger.name,
            Destinatário: label,
            Assunto: renderTemplate(action.subject, ctx),
            Corpo: renderTemplate(action.body, ctx),
          },
          createdAt,
        });
        break;
      }
      case 'set_status':
        patch.statusId = action.statusId;
        ctx.ticket = { ...ctx.ticket, statusId: action.statusId };
        break;
      case 'set_priority':
        patch.priority = action.priority;
        ctx.ticket = { ...ctx.ticket, priority: action.priority };
        break;
      case 'add_tags': {
        const tags = [...new Set([...ctx.ticket.tags, ...action.tags])];
        patch.tags = tags;
        ctx.ticket = { ...ctx.ticket, tags };
        break;
      }
      case 'assign_group':
        patch.assigneeGroupId = action.groupId;
        ctx.ticket = { ...ctx.ticket, assigneeGroupId: action.groupId };
        break;
    }
  }
}

/** Avalia os gatilhos ativos, em ordem, sobre o contexto. Não altera o contexto recebido. */
export function runTriggers(triggers: Trigger[], context: TriggerContext): TriggerRunResult {
  const ctx: TriggerContext = { ...context };
  const patch: TriggerPatch = {};
  const events: AuditEvent[] = [];
  const fired: string[] = [];
  for (const trigger of triggers) {
    if (!trigger.active || !triggerMatches(trigger, ctx)) continue;
    fired.push(trigger.id);
    runActions(trigger, ctx, patch, events);
  }
  return { patch, events, fired };
}
