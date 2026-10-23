import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, db } from '@/api/mock/db';
import { configureApi } from '@/api/mock/delay';
import { resetRefData, useRefData } from '@/store/useRefData';
import { useTabs } from '@/store/useTabs';
import { useTickets } from '@/store/useTickets';
import { useUi } from '@/store/useUi';
import { pendingRequired, useFormStore } from './formStore';

const F = () => useFormStore.getState();
const NEW = 'new-ticket:1';
const solved = () => db.statuses.find((s) => s.category === 'solved')!.id;

async function setupNew(formId?: string) {
  useTabs.getState().openTab({ kind: 'new-ticket', refId: '1', title: 'Novo ticket' });
  F().init(NEW, null);
  await useRefData.getState().ensureCustom();
  await new Promise((r) => setTimeout(r, 0));
  F().patch(NEW, { subject: 'Assunto', requesterId: 'u1' });
  F().setBody(NEW, '<p>Descrição</p>');
  if (formId) F().selectForm(NEW, formId);
}

beforeEach(async () => {
  resetDb();
  resetRefData();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
  useFormStore.setState({ forms: {}, requiredPrompt: null, focusRequest: null, pendingClose: null });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useUi.setState({ toasts: [] });
  useTickets.setState({ loaded: false, tickets: [], counts: {} });
  await useTickets.getState().load();
  await useRefData.getState().refresh();
  await useRefData.getState().refreshCustom();
});

describe('formStore: campos personalizados e formulário', () => {
  it('ticket novo nasce no formulário padrão (sem ficar sujo por isso)', async () => {
    await setupNew();
    expect(F().forms[NEW]!.values.formId).toBe('1');
    expect(F().forms[NEW]!.original.formId).toBe('1');
  });

  it('escolher o formulário aplica equipe e tipo padrão; trocar de novo troca os que eram do anterior, não os do agente', async () => {
    await setupNew('2');
    expect(F().forms[NEW]!.values).toMatchObject({ formId: '2', assigneeGroupId: 'g2', type: 'incident' });
    F().selectForm(NEW, '3'); // Financeiro: equipe g1, sem tipo
    expect(F().forms[NEW]!.values).toMatchObject({ formId: '3', assigneeGroupId: 'g1', type: 'incident' });
    F().patch(NEW, { type: 'task' });
    F().selectForm(NEW, '2');
    expect(F().forms[NEW]!.values.type).toBe('task'); // o agente escolheu: não é sobrescrito
  });

  it('valida obrigatórios ao criar no cliente (por campo) antes de enviar; nada é criado', async () => {
    await setupNew('2');
    const before = db.tickets.length;
    const r = await F().submit(NEW);
    expect(r).toMatchObject({ ok: false, kind: 'validation' });
    expect(F().forms[NEW]!.errors.fields).toBe('Preencha os campos obrigatórios: Número do contrato, Severidade.');
    expect(F().forms[NEW]!.fieldErrors).toEqual({ numero_do_contrato: 'Campo obrigatório.', severidade: 'Campo obrigatório.' });
    expect(db.tickets).toHaveLength(before);
    F().setFieldValue(NEW, 'numero_do_contrato', 'C-1');
    expect(F().forms[NEW]!.fieldErrors).toEqual({ severidade: 'Campo obrigatório.' });
    F().setFieldValue(NEW, 'severidade', 'alta');
    expect(F().forms[NEW]!.errors.fields).toBeUndefined();
    const ok = await F().submit(NEW);
    expect(ok).toMatchObject({ ok: true, created: true });
    if (ok.ok) expect(ok.ticket).toMatchObject({ formId: '2', type: 'incident', fieldValues: { numero_do_contrato: 'C-1', severidade: 'alta' } });
  });

  it('checkbox false conta como preenchido e vazio apaga a chave', async () => {
    await setupNew('3');
    F().setFieldValue(NEW, 'cliente_aprovou', false);
    expect(F().forms[NEW]!.values.fieldValues).toEqual({ cliente_aprovou: false });
    F().setFieldValue(NEW, 'cliente_aprovou', null);
    expect(F().forms[NEW]!.values.fieldValues).toEqual({});
  });

  it('ticket existente: só o que mudou vai no patch (custom_fields) e formId; isDirty reage', async () => {
    const t = useTickets.getState().tickets.find((x) => x.formId === '2')!;
    const key = `ticket:${t.id}`;
    useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
    F().init(key, t);
    expect(F().isDirty(key)).toBe(false);
    F().setFieldValue(key, 'prazo_acordado', '2026-12-31');
    F().setFieldValue(key, 'numero_do_contrato', null);
    expect(F().isDirty(key)).toBe(true);
    const r = await F().submit(key);
    expect(r.ok).toBe(true);
    const saved = useTickets.getState().tickets.find((x) => x.id === t.id)!;
    expect(saved.fieldValues).toEqual({ severidade: t.fieldValues!.severidade, prazo_acordado: '2026-12-31' });
    expect(saved.events.at(-1)!.text).toMatch(/^campo: /);
    expect(F().isDirty(key)).toBe(false);
  });

  it('resolver com obrigatório vazio: avisa no cliente (sem enviar) e "Enviar assim mesmo" deixa o servidor decidir', async () => {
    const t = useTickets.getState().tickets.find((x) => x.formId === '2' && x.statusId !== solved())!;
    const key = `ticket:${t.id}`;
    useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
    F().init(key, t);
    F().setFieldValue(key, 'severidade', null);
    F().setBody(key, '<p>pronto</p>');
    expect(pendingRequired(F().forms[key]!.values).map((m) => m.slug)).toEqual(['severidade']);
    const r = await F().submit(key, solved());
    expect(r).toMatchObject({ ok: false, kind: 'required_fields' });
    expect(F().requiredPrompt).toMatchObject({ key, source: 'client', fields: [{ slug: 'severidade', title: 'Severidade' }] });
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe(t.statusId); // nada enviado

    // envia assim mesmo: o mock (como o servidor) recusa, o texto continua e o prompt vira "server"
    const again = await F().sendAnyway();
    expect(again).toMatchObject({ ok: false, kind: 'required_fields' });
    expect(F().requiredPrompt).toMatchObject({ source: 'server', fields: [{ slug: 'severidade' }] });
    expect(F().forms[key]!.bodyHtml).toBe('<p>pronto</p>');
    expect(F().forms[key]!.apiError).toBeNull();
    expect(F().forms[key]!.submitting).toBe(false);
    expect(F().forms[key]!.fieldErrors).toEqual({ severidade: 'Campo obrigatório.' });
  });

  it('"Ir ao campo" fecha o diálogo e pede o foco; preencher e reenviar fecha o ticket', async () => {
    const t = useTickets.getState().tickets.find((x) => x.formId === '2' && x.statusId !== solved())!;
    const key = `ticket:${t.id}`;
    useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
    F().init(key, t);
    F().setFieldValue(key, 'severidade', null);
    await F().submit(key, solved());
    F().focusField(key, 'severidade');
    expect(F().requiredPrompt).toBeNull();
    expect(F().focusRequest).toMatchObject({ key, slug: 'severidade' });
    F().setFieldValue(key, 'severidade', 'baixa');
    const r = await F().submit(key, solved());
    expect(r.ok).toBe(true);
    expect(useTickets.getState().tickets.find((x) => x.id === t.id)!.statusId).toBe(solved());
  });

  it('400 por campo do servidor fica no campo certo, mantém o digitado e não abre diálogo', async () => {
    const t = useTickets.getState().tickets.find((x) => x.formId === '3' || x.formId === '1')!;
    const key = `ticket:${t.id}`;
    useTabs.getState().openTab({ kind: 'ticket', refId: t.id, title: t.subject });
    F().init(key, t);
    F().setFieldValue(key, 'campo_fantasma', 'x');
    const r = await F().submit(key);
    expect(r).toMatchObject({ ok: false, kind: 'validation' });
    expect(F().forms[key]!.fieldErrors).toEqual({ campo_fantasma: 'Campo personalizado inexistente.' });
    expect(F().forms[key]!.errors.fields).toMatch(/Revise os campos/);
    expect(F().forms[key]!.values.fieldValues.campo_fantasma).toBe('x');
    expect(F().requiredPrompt).toBeNull();
  });

  it('reset descarta valores pendentes e erros por campo', async () => {
    await setupNew('2');
    await F().submit(NEW);
    F().reset(NEW);
    expect(F().forms[NEW]!.fieldErrors).toEqual({});
    expect(F().forms[NEW]!.values.fieldValues).toEqual({});
  });
});
