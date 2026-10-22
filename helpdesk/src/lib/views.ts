import type { StatusCategory, Ticket, TicketStatus, View, ViewCondition } from '@/types/domain';

export interface ViewContext {
  /** Id do agente logado (`me`). */
  meId: string;
  now: Date;
  statuses: TicketStatus[];
}

function categoryOf(ticket: Ticket, statuses: TicketStatus[]): StatusCategory {
  return statuses.find((s) => s.id === ticket.statusId)?.category ?? 'open';
}

function matches(c: ViewCondition, t: Ticket, ctx: ViewContext): boolean {
  switch (c.field) {
    case 'assignee': {
      const target = c.value === 'me' ? ctx.meId : c.value;
      if (c.operator === 'present') return !!t.assigneeId;
      if (c.operator === 'not_present') return !t.assigneeId;
      if (c.operator === 'is') return t.assigneeId === target;
      return t.assigneeId !== target;
    }
    case 'group':
      return c.operator === 'is_not' ? t.assigneeGroupId !== c.value : t.assigneeGroupId === c.value;
    case 'status_category': {
      const cat = categoryOf(t, ctx.statuses);
      return c.operator === 'is_not' ? cat !== c.value : cat === c.value;
    }
    case 'updated_within_hours': {
      const hours = (ctx.now.getTime() - new Date(t.updatedAt).getTime()) / 3_600_000;
      return hours < Number(c.value ?? 0);
    }
  }
}

/** Tickets que satisfazem a view, mais recentemente atualizados primeiro. */
export function runView(view: View, tickets: Ticket[], ctx: ViewContext): Ticket[] {
  const { all, any = [] } = view.conditions;
  return tickets
    .filter((t) => all.every((c) => matches(c, t, ctx)) && (any.length === 0 || any.some((c) => matches(c, t, ctx))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Função única de contagem usada pelos contadores das views. */
export function countView(view: View, tickets: Ticket[], ctx: ViewContext): number {
  return runView(view, tickets, ctx).length;
}

/** Contadores de todas as views, por `countKey`. */
export function countViews(views: View[], tickets: Ticket[], ctx: ViewContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of views) out[v.countKey] = countView(v, tickets, ctx);
  return out;
}
