import { beforeEach, describe, expect, it } from 'vitest';
import { requiredFromError } from '@/lib/customFields';
import { configureApi } from './delay';
import { db, resetDb } from './db';
import * as fields from './fields';
import * as forms from './forms';
import * as tickets from './tickets';

beforeEach(() => {
  resetDb();
  configureApi({ delayMin: 0, delayMax: 0, failRate: 0 });
});

const solved = () => db.statuses.find((s) => s.category === 'solved')!.id;
const NEW = { subject: 'AG', requesterId: 'u1', bodyHtml: '<p>oi</p>' };

describe('mock: campos personalizados', () => {
  it('lista só os personalizados (os padrão do front não vêm daqui), ordenados, com contagem de usos', async () => {
    const list = await fields.listFields();
    expect(list.every((f) => !f.system)).toBe(true);
    expect(list.map((f) => f.order)).toEqual([...list.map((f) => f.order)].sort((a, b) => a! - b!));
    expect(list.find((f) => f.slug === 'numero_do_contrato')!.valuesCount).toBeGreaterThan(0);
  });

  it('cria com slug do título (sem colisão), dropdown exige opções únicas, título é obrigatório', async () => {
    const a = await fields.createField({ title: 'Número do contrato', type: 'text' });
    expect(a.slug).toBe('numero_do_contrato_2');
    await expect(fields.createField({ title: '  ', type: 'text' })).rejects.toMatchObject({ status: 400, fieldErrors: { title: ['Informe o título.'] } });
    await expect(fields.createField({ title: 'Lista', type: 'dropdown', options: [] })).rejects.toMatchObject({ fieldErrors: { options: ['Informe ao menos uma opção para a lista.'] } });
    await expect(fields.createField({ title: 'Lista', type: 'dropdown', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'a' }] })).rejects.toMatchObject({ fieldErrors: { options: [expect.stringContaining('repetida')] } });
    const ok = await fields.createField({ title: 'Lista', type: 'dropdown', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    expect(ok.options?.map((o) => o.value)).toEqual(['a', 'b']);
  });

  it('o tipo não muda depois de existirem valores; antes pode', async () => {
    await expect(fields.updateField('numero_do_contrato', { type: 'number' })).rejects.toMatchObject({ status: 400, fieldErrors: { type: [expect.stringContaining('não pode mudar')] } });
    const f = await fields.updateField('valor_em_disputa', { type: 'text' });
    expect(f.type).toBe('text');
  });

  it('apagar campo em uso é 409 field_in_use; sem uso apaga e sai dos formulários', async () => {
    await expect(fields.deleteField('numero_do_contrato')).rejects.toMatchObject({ status: 409, code: 'field_in_use' });
    await fields.deleteField('valor_em_disputa');
    expect((await fields.listFields()).some((f) => f.id === 'valor_em_disputa')).toBe(false);
    expect((await forms.listForms()).every((f) => f.fields.every((i) => i.slug !== 'valor_em_disputa'))).toBe(true);
  });

  it('limite de 60 campos ativos e reordenação', async () => {
    for (let i = 0; db.fields.filter((f) => f.active).length < 60; i += 1) await fields.createField({ title: `Campo ${i}`, type: 'text' });
    await expect(fields.createField({ title: 'Mais um', type: 'text' })).rejects.toMatchObject({ status: 400 });
    const ids = (await fields.listFields()).map((f) => f.id);
    const out = await fields.reorderFields([ids[2]!, ids[0]!]);
    expect(out.slice(0, 3).map((f) => f.id)).toEqual([ids[2], ids[0], ids[1]]);
  });
});

describe('mock: formulários', () => {
  it('sempre um padrão ativo: trocar o padrão, e 409 ao tirar, desativar ou apagar o padrão', async () => {
    await expect(forms.updateForm('1', { isDefault: false })).rejects.toMatchObject({ status: 409, code: 'default_form_required' });
    await expect(forms.updateForm('1', { active: false })).rejects.toMatchObject({ status: 409, code: 'default_form_required' });
    await expect(forms.deleteForm('1')).rejects.toMatchObject({ status: 409, code: 'default_form_required' });
    await forms.updateForm('3', { isDefault: true });
    const list = await forms.listForms();
    expect(list.filter((f) => f.isDefault).map((f) => f.id)).toEqual(['3']);
    // o antigo padrão tem tickets: só dá para desativar
    await expect(forms.deleteForm('1')).rejects.toMatchObject({ code: 'form_in_use' });
    expect((await forms.updateForm('1', { active: false })).active).toBe(false);
  });

  it('apagar formulário com tickets é 409 form_in_use; desativar vale', async () => {
    await expect(forms.deleteForm('2')).rejects.toMatchObject({ status: 409, code: 'form_in_use' });
    expect((await forms.updateForm('2', { active: false })).active).toBe(false);
  });

  it('cria, valida nome único e campos, clona sem virar padrão e reordena', async () => {
    const f = await forms.createForm({ name: 'Novo', defaultTeamId: 'g2', defaultType: 'task', fields: [{ field: 'severidade', required: true }, { field: 'numero_do_contrato', required: false }] });
    expect(f).toMatchObject({ defaultTeamName: 'Suporte N2', defaultType: 'task', isDefault: false });
    expect(f.fields.map((i) => [i.slug, i.required])).toEqual([['severidade', true], ['numero_do_contrato', false]]);
    await expect(forms.createForm({ name: 'novo' })).rejects.toMatchObject({ fieldErrors: { name: ['Já existe um formulário com este nome.'] } });
    await expect(forms.createForm({ name: 'X', fields: [{ field: 'nada', required: false }] })).rejects.toMatchObject({ fieldErrors: { form_fields: [expect.stringContaining('não existe')] } });
    await expect(forms.createForm({ name: 'Y', fields: [{ field: 'grupo_do_canal', required: false }] })).rejects.toMatchObject({ fieldErrors: { form_fields: [expect.stringContaining('desativado')] } });
    const copy = await forms.cloneForm(f.id);
    expect(copy).toMatchObject({ name: 'Cópia de Novo', isDefault: false });
    expect((await forms.cloneForm(f.id)).name).toBe('Cópia de Novo (2)');
    const order = (await forms.reorderForms([copy.id])).map((x) => x.id);
    expect(order[0]).toBe(copy.id);
  });
});

describe('mock: valores no ticket', () => {
  it('criar exige os obrigatórios (400 required_custom_fields, ticket não é criado) e aplica equipe/tipo do formulário', async () => {
    const before = db.tickets.length;
    const err = await tickets.createTicket({ ...NEW, formId: '2', fieldValues: {} }).catch((e) => e);
    expect(err).toMatchObject({ status: 400, code: 'required_custom_fields' });
    expect(requiredFromError(err)?.map((m) => m.slug)).toEqual(['numero_do_contrato', 'severidade']);
    expect(db.tickets).toHaveLength(before);
    const t = await tickets.createTicket({ ...NEW, formId: '2', fieldValues: { numero_do_contrato: 'C-1', severidade: 'alta' } });
    expect(t).toMatchObject({ formId: '2', type: 'incident', assigneeGroupId: 'g2', fieldValues: { numero_do_contrato: 'C-1', severidade: 'alta' } });
    // equipe/tipo enviados no POST valem mais que os do formulário
    const t2 = await tickets.createTicket({ ...NEW, formId: '2', assigneeGroupId: 'g1', type: 'task', fieldValues: { numero_do_contrato: 'C-1', severidade: 'alta' } });
    expect(t2).toMatchObject({ assigneeGroupId: 'g1', type: 'task' });
    // sem form_id: vale o padrão e nada dele é aplicado
    expect(await tickets.createTicket(NEW)).toMatchObject({ formId: '1', assigneeGroupId: 'g1' });
  });

  it('valor inválido é 400 por campo e nada é gravado', async () => {
    const err = await tickets.createTicket({ ...NEW, formId: '3', fieldValues: { valor_em_disputa: 'abc' } }).catch((e) => e);
    expect(err).toMatchObject({ status: 400 });
    expect((err.body as { custom_fields: Record<string, string> }).custom_fields.valor_em_disputa).toMatch(/número/);
    const e2 = await tickets.updateTicket(1, { fieldValues: { fantasma: 'x' } }).catch((e) => e);
    expect((e2.body as { custom_fields: Record<string, string> }).custom_fields.fantasma).toMatch(/inexistente/);
    const e3 = await tickets.updateTicket(1, { fieldValues: { grupo_do_canal: 'x' } }).catch((e) => e);
    expect(e3.status).toBe(400); // campo inativo só aceita apagar
  });

  it('editar grava por slug (null apaga), registra evento `campo: …` e troca de formulário', async () => {
    const t = await tickets.updateTicket(1, { fieldValues: { valor_em_disputa: 12.5, cliente_aprovou: false }, formId: '3' });
    expect(t.fieldValues).toMatchObject({ valor_em_disputa: 12.5, cliente_aprovou: false });
    expect(t.formId).toBe('3');
    expect(t.events.map((e) => e.text)).toEqual(expect.arrayContaining(['campo: Valor em disputa: — → 12,5', 'campo: Cliente aprovou: — → Não', 'formulário → Financeiro']));
    const cleared = await tickets.updateTicket(1, { fieldValues: { valor_em_disputa: null }, formId: null });
    expect(cleared.fieldValues).not.toHaveProperty('valor_em_disputa');
    expect(cleared.formId).toBe('1');
    // sem mudança, sem evento
    const n = cleared.events.length;
    expect((await tickets.updateTicket(1, { fieldValues: { cliente_aprovou: false } })).events).toHaveLength(n);
  });

  it('resolver exige os obrigatórios do formulário do ticket e nada é gravado; com o valor, resolve', async () => {
    const incident = db.tickets.find((t) => t.formId === '2' && t.statusId !== solved())!;
    await tickets.updateTicket(incident.id, { fieldValues: { severidade: null } });
    const err = await tickets.updateTicket(incident.id, { statusId: solved() }, { authorId: 'a1', public: true, bodyHtml: '<p>feito</p>' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'required_custom_fields' });
    expect(requiredFromError(err)?.[0]).toMatchObject({ slug: 'severidade', title: 'Severidade' });
    const still = await tickets.getTicket(incident.id);
    expect(still.statusId).not.toBe(solved());
    expect(still.comments.some((c) => c.bodyHtml.includes('feito'))).toBe(false);
    const done = await tickets.updateTicket(incident.id, { statusId: solved(), fieldValues: { severidade: 'baixa' } });
    expect(done.statusId).toBe(solved());
  });

  it('lote: o ticket com pendência vai para failed[] com os nomes; os demais fecham', async () => {
    const [a, b] = db.tickets.filter((t) => t.formId === '2' && t.statusId !== solved()).slice(0, 2);
    await tickets.updateTicket(a!.id, { fieldValues: { numero_do_contrato: null } });
    const res = await tickets.bulkUpdate([a!.id, b!.id], { statusId: solved() });
    expect(res.updated.map((t) => t.id)).toEqual([b!.id]);
    expect(res.failed).toEqual([{ id: a!.id, message: expect.stringContaining('Número do contrato') }]);
  });
});
