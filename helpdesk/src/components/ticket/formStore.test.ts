import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, db } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { macros } from '@/api/mock/data';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { useFormStore } from './formStore';

const F = () => useFormStore.getState();
const NEW = 'new-ticket:1';

async function setupNew(over: { body?: string; mode?: 'public' | 'internal'; requester?: string } = {}) {
  useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
  F().init(NEW, null);
  F().patch(NEW, { subject: 'Assunto de teste', requesterId: over.requester ?? 'u1' });
  F().setReplyMode(NEW, over.mode ?? 'public');
  F().setBody(NEW, over.body ?? '<p>Descrição</p>');
}

beforeEach(async () => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {} });
  await useTickets.getState().load();
});

describe('formStore: dirty e edição', () => {
  it('sincroniza o ponto de não salvo da aba', () => {
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me')!;
    useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
    const key = `ticket:${t.id}`;
    F().init(key, t);
    expect(F().isDirty(key)).toBe(false);
    F().patch(key, { priority: 'urgent' });
    expect(F().isDirty(key)).toBe(true);
    expect(useTabs.getState().tabs[0]!.dirty).toBe(true);
    F().reset(key);
    expect(F().isDirty(key)).toBe(false);
    expect(useTabs.getState().tabs[0]!.dirty).toBe(false);
    F().setBody(key, '<p>texto</p>');
    expect(useTabs.getState().tabs[0]!.dirty).toBe(true);
  });

  it('init não sobrescreve edições pendentes', () => {
    const t = useTickets.getState().tickets[0]!;
    F().init('ticket:x', t);
    F().patch('ticket:x', { tags: ['a'] });
    F().init('ticket:x', t);
    expect(F().forms['ticket:x']!.values.tags).toEqual(['a']);
  });

  it('rebase (tempo real): formulário intocado adota o servidor; com edição pendente, preserva', () => {
    const t = useTickets.getState().tickets[0]!;
    F().init('ticket:r', t);
    F().rebase('ticket:r', { ...t, priority: 'urgent' });
    expect(F().forms['ticket:r']!.values.priority).toBe('urgent');
    expect(F().isDirty('ticket:r')).toBe(false);
    F().patch('ticket:r', { tags: ['minha'] });
    F().rebase('ticket:r', { ...t, priority: 'low' });
    expect(F().forms['ticket:r']!.values.priority).toBe('urgent');
    expect(F().forms['ticket:r']!.values.tags).toEqual(['minha']);
  });

  it('aplicar macro altera status, tags e texto no modo atual, sem enviar', () => {
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me')!;
    const key = `ticket:${t.id}`;
    F().init(key, t);
    const pend = macros.find((m) => m.actions.publicReply)!;
    F().applyMacro(key, pend);
    const e = F().forms[key]!;
    expect(e.values.statusId).toBe(pend.actions.status);
    expect(e.bodyHtml).toContain(pend.actions.publicReply!.slice(0, 10));
    expect(e.replyMode).toBe('public');
    expect(db.tickets.find((x) => x.id === t.id)!.statusId).toBe(t.statusId);
    // macro só com nota: acompanha o modo
    const note = macros.find((m) => m.actions.internalNote && !m.actions.publicReply)!;
    F().reset(key);
    F().applyMacro(key, note);
    expect(F().forms[key]!.replyMode).toBe('internal');
    expect(F().forms[key]!.bodyHtml).toContain('<p>');
  });
});

describe('formStore: envio', () => {
  it('valida assunto, solicitante, descrição e atribuído em ticket novo', async () => {
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
    F().init(NEW, null);
    const r = await F().submit(NEW);
    expect(r.ok).toBe(false);
    expect(Object.keys(F().forms[NEW]!.errors).sort()).toEqual(['assignee', 'comment', 'requester', 'subject']);
    expect(db.tickets).toHaveLength(30);
  });

  it('comentário vazio só vale se houve mudança de campo', async () => {
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me')!;
    const key = `ticket:${t.id}`;
    F().init(key, t);
    expect((await F().submit(key)).ok).toBe(false);
    expect(F().forms[key]!.errors.comment).toBeTruthy();
    F().patch(key, { priority: 'urgent' });
    const r = await F().submit(key);
    expect(r.ok).toBe(true);
    expect(db.tickets.find((x) => x.id === t.id)!.priority).toBe('urgent');
    expect(F().isDirty(key)).toBe(false);
  });

  it('Resolvido no menu envia com o status escolhido', async () => {
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me' && x.statusId !== 'solved')!;
    const key = `ticket:${t.id}`;
    F().init(key, t);
    F().setBody(key, '<p>Resolvido!</p>');
    const before = useTickets.getState().counts['solved-recent'] ?? 0;
    const r = await F().submit(key, 'solved');
    expect(r.ok).toBe(true);
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe('solved');
    expect(useTickets.getState().counts['solved-recent']).toBe(before + 1);
    expect(F().forms[key]!.bodyHtml).toBe('');
  });

  it('modo de resposta persiste após o envio', async () => {
    const t = useTickets.getState().tickets.find((x) => x.assigneeId === 'me')!;
    const key = `ticket:${t.id}`;
    F().init(key, t);
    F().setReplyMode(key, 'internal');
    F().setBody(key, '<p>nota</p>');
    await F().submit(key);
    const e = F().forms[key]!;
    expect(e.replyMode).toBe('internal');
    expect(db.tickets.find((x) => x.id === t.id)!.comments.at(-1)!.public).toBe(false);
  });

  it('ticket novo com resposta pública gera o evento do gatilho; com nota interna, não', async () => {
    await setupNew();
    const pub = await F().submit(NEW);
    expect(pub.ok && pub.created).toBe(true);
    const created = db.tickets.find((x) => x.id === (pub.ok ? pub.ticketId : -1))!;
    expect(created.events.filter((e) => e.kind === 'notification' && e.text.includes('Gatilho'))).toHaveLength(1);

    F().remove('ticket:' + created.id);
    await setupNew({ mode: 'internal' });
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '2', title: 'Novo ticket' });
    F().init('new-ticket:2', null);
    F().patch('new-ticket:2', { subject: 'Com nota', requesterId: 'u1' });
    F().setReplyMode('new-ticket:2', 'internal');
    F().setBody('new-ticket:2', '<p>só interno</p>');
    const note = await F().submit('new-ticket:2');
    expect(note.ok).toBe(true);
    const t2 = db.tickets.find((x) => x.id === (note.ok ? note.ticketId : -1))!;
    expect(t2.comments[0]!.public).toBe(false);
    expect(t2.events.filter((e) => e.text.includes('Gatilho'))).toHaveLength(0);
  });

  it('converte a MESMA aba em ticket criado, auto-atribui ao criador e permanece', async () => {
    await setupNew(); // u1 -> Lojas Horizonte -> g1 (eu sou agente)
    expect(F().forms[NEW]!.values.assigneeGroupId).toBe('g1');
    const r = await F().submit(NEW);
    if (!r.ok) throw new Error(r.error);
    const { tabs, activeTabId } = useTabs.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: `ticket:${r.ticketId}`, kind: 'ticket', dirty: false });
    expect(activeTabId).toBe(`ticket:${r.ticketId}`);
    expect(r.ticket.assigneeId).toBe('me');
    expect(F().forms[NEW]).toBeUndefined();
    expect(F().forms[`ticket:${r.ticketId}`]!.isNew).toBe(false);
    expect(useUi.getState().toasts.at(-1)!.title).toBe(`Ticket #${r.ticketId} foi criado`);
    expect(useUi.getState().toasts.at(-1)!.action).toBeTruthy();
  });

  it('não auto-atribui se o criador não é agente do grupo; "Fechar aba" fecha', async () => {
    await setupNew({ requester: 'u7' }); // Rápido Sul -> g2
    F().setStayOnTicket(NEW, false);
    const r = await F().submit(NEW);
    if (!r.ok) throw new Error(r.error);
    expect(r.ticket.assigneeId).toBeUndefined();
    expect(useTabs.getState().tabs).toHaveLength(0);
  });

  it('falha de API devolve erro sem perder o texto e permite tentar de novo', async () => {
    await setupNew();
    configureApi({ failRate: 1 });
    const r = await F().submit(NEW);
    expect(r.ok).toBe(false);
    const e = F().forms[NEW]!;
    expect(e.apiError).toBeTruthy();
    expect(e.bodyHtml).toBe('<p>Descrição</p>');
    expect(e.submitting).toBe(false);
    configureApi({ failRate: 0 });
    expect((await F().retry(NEW)).ok).toBe(true);
  });

  it('fechar a aba descarta o formulário', () => {
    useTabs.getState().openTab({ kind: 'new-ticket', refId: '9', title: 'Novo' });
    F().init('new-ticket:9', null);
    useTabs.getState().closeTab('new-ticket:9');
    expect(F().forms['new-ticket:9']).toBeUndefined();
  });
});
