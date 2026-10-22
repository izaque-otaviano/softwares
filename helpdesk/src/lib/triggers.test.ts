import { describe, expect, it } from 'vitest';
import { statuses, tickets, triggers, endUsers } from '@/api/mock/data';
import type { Ticket, Trigger } from '@/types/domain';
import { evaluateCondition, renderTemplate, runTriggers, triggerMatches, type TriggerContext } from './triggers';

const base = tickets[0] as Ticket;

function ctx(over: Partial<Omit<TriggerContext, 'ticket'>> & { ticket?: Partial<Ticket> } = {}): TriggerContext {
  const { ticket, ...rest } = over;
  return {
    ticket: { ...base, assigneeId: undefined, priority: 'normal', tags: [], ...ticket },
    isNew: true,
    comment: { public: true, bodyHtml: '<p>Olá</p>' },
    requester: endUsers[0],
    statuses,
    actorId: 'me',
    ...rest,
  };
}

const t = (id: string): Trigger => triggers.find((x) => x.id === id)!;

describe('motor de gatilhos', () => {
  it('avalia operadores', () => {
    const c = ctx({ ticket: { subject: 'Pedido de Reembolso', priority: 'urgent', tags: ['vip'] } });
    expect(evaluateCondition({ field: 'ticket.priority', operator: 'is', value: 'urgent' }, c)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.priority', operator: 'is_not', value: 'urgent' }, c)).toBe(false);
    expect(evaluateCondition({ field: 'ticket.subject', operator: 'contains', value: 'reembolso' }, c)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.tags', operator: 'contains', value: 'vi' }, c)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.assignee', operator: 'not_present' }, c)).toBe(true);
    expect(evaluateCondition({ field: 'requester.role', operator: 'is', value: 'end_user' }, c)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.id', operator: 'greater_than', value: '0' }, c)).toBe(true);
  });

  it('all exige todas; any exige ao menos uma; sem condições nunca dispara', () => {
    expect(triggerMatches(t('t1'), ctx())).toBe(true);
    expect(triggerMatches(t('t1'), ctx({ isNew: false }))).toBe(false);
    expect(triggerMatches(t('t5'), ctx({ ticket: { subject: 'Preciso de estorno' } }))).toBe(true);
    expect(triggerMatches(t('t5'), ctx({ ticket: { subject: 'Outro assunto' } }))).toBe(false);
    expect(triggerMatches({ ...t('t1'), all: [], any: [] }, ctx())).toBe(false);
  });

  it('ticket novo com comentário público gera notificação ao solicitante; com nota interna, não', () => {
    const pub = runTriggers(triggers, ctx());
    const notes = pub.events.filter((e) => e.kind === 'notification');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.authorId).toBe('system');
    expect(notes[0]!.text).toContain(t('t1').name);
    expect(notes[0]!.meta?.Assunto).toContain(String(base.id));

    const internal = runTriggers(triggers, ctx({ comment: { public: false, bodyHtml: '<p>nota</p>' } }));
    expect(internal.events.filter((e) => e.kind === 'notification')).toHaveLength(0);
  });

  it('executa ações de campo e as encadeia nos gatilhos seguintes', () => {
    const r = runTriggers(triggers, ctx({ ticket: { priority: 'urgent', subject: 'Reembolso' } }));
    expect(r.patch.assigneeGroupId).toBe('g2');
    expect(r.patch.tags).toContain('reembolso');
    expect(r.fired).toEqual(expect.arrayContaining(['t4', 't5']));
  });

  it('ignora gatilhos inativos e não notifica o próprio autor da atribuição', () => {
    expect(triggerMatches({ ...t('t6') }, ctx({ ticket: { statusId: 'pending' }, isNew: false }))).toBe(true);
    expect(runTriggers(triggers, ctx({ ticket: { statusId: 'pending' }, isNew: false })).fired).not.toContain('t6');
    const self = ctx({ ticket: { assigneeId: 'me' }, assignee: undefined, assigneeChanged: true });
    expect(runTriggers(triggers, self).fired).toContain('t3');
    expect(runTriggers(triggers, self).events.some((e) => e.meta?.triggerId === 't3')).toBe(false);
  });

  it('renderiza placeholders', () => {
    expect(renderTemplate('Oi {{ticket.requester.first_name}}, #{{ticket.id}} {{ticket.title}}', ctx())).toContain(`#${base.id}`);
  });
});
