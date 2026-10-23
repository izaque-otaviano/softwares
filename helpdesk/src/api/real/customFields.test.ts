import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bulkRequired from './__fixtures__/bulk-close-required.json';
import cf400 from './__fixtures__/custom-fields-400.json';
import fieldsFx from './__fixtures__/ticket-fields.json';
import formsFx from './__fixtures__/ticket-forms.json';
import ticketCf from './__fixtures__/ticket-custom-detail.json';
import requiredFx from './__fixtures__/required-custom-fields.json';
import roster from './__fixtures__/teams-roster.json';
import statusesFx from './__fixtures__/statuses.json';
import { ApiError, PartialUpdateError } from '../errors';
import { customFieldErrors, requiredFromError } from '@/lib/customFields';
import * as auth from './auth';
import * as realFields from './fields';
import * as realForms from './forms';
import * as realTickets from './tickets';
import { resetLocalLayers } from './local';
import { resetRealCache } from './refs';

/** Campos, formulários e `custom_fields`/`form_id` nos tickets, com `fetch` simulado (200/400/403/404/409 e required_custom_fields). */
type Json = Record<string, any>;
interface Call {
  method: string;
  path: string;
  search: string;
  body: Json | FormData | undefined;
}
let calls: Call[] = [];
let handler: (c: Call) => { status: number; body?: unknown } | undefined;
const ok = (body: unknown, status = 200) => ({ status, body });

beforeEach(() => {
  calls = [];
  handler = () => undefined;
  resetRealCache();
  resetLocalLayers();
  vi.spyOn(auth, 'getRealMeId').mockReturnValue('1');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://127.0.0.1');
      const body = init?.body instanceof FormData ? init.body : init?.body ? (JSON.parse(String(init.body)) as Json) : undefined;
      const call: Call = { method: init?.method ?? 'GET', path: u.pathname.replace('/api/v1', ''), search: u.search, body };
      calls.push(call);
      const res = handler(call) ?? defaults(call);
      return new Response(res.status === 204 ? null : JSON.stringify(res.body ?? {}), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function defaults(c: Call): { status: number; body?: unknown } {
  if (c.method === 'GET' && c.path === '/settings/statuses/') return ok(statusesFx);
  if (c.method === 'GET' && c.path === '/settings/tags/') return ok({ count: 0, next: null, previous: null, results: [] });
  if (c.method === 'GET' && c.path === '/settings/teams/roster/') return ok(roster);
  if (c.method === 'GET' && c.path === '/tickets/183/') return ok(structuredClone(ticketCf));
  return { status: 404, body: { detail: 'Não encontrado.' } };
}

const writes = () => calls.filter((c) => c.method !== 'GET');

describe('api real: campos personalizados (/settings/ticket-fields/)', () => {
  it('lista com envelope paginado, ordenada por `order`, já mapeada', async () => {
    handler = (c) => (c.path === '/settings/ticket-fields/' ? ok({ ...fieldsFx, results: [...fieldsFx.results].reverse() }) : undefined);
    const list = await realFields.listFields();
    expect(list.map((f) => f.slug)).toEqual(fieldsFx.results.map((f) => f.slug));
    expect(list[1]!.options?.map((o) => o.label)).toEqual(['Alta', 'Baixa']);
  });

  it('cria com o corpo do backend (is_required, options {value,label}) e devolve o campo', async () => {
    handler = (c) => (c.method === 'POST' ? ok(fieldsFx.results[1], 201) : undefined);
    const f = await realFields.createField({ title: ' AG-front Severidade ', type: 'dropdown', required: false, options: [{ value: 'alta', label: 'Alta' }, { value: 'baixa', label: 'Baixa' }] });
    expect(writes()[0]).toMatchObject({ method: 'POST', path: '/settings/ticket-fields/', body: { title: 'AG-front Severidade', type: 'dropdown', is_required: false, options: [{ value: 'alta', label: 'Alta' }, { value: 'baixa', label: 'Baixa' }] } });
    expect(f.id).toBe('2');
  });

  it('edita e ativa/desativa por PATCH', async () => {
    handler = (c) => (c.method === 'PATCH' ? ok({ ...fieldsFx.results[0], is_active: false }) : undefined);
    const f = await realFields.setFieldActive('1', false);
    expect(writes()[0]).toMatchObject({ method: 'PATCH', path: '/settings/ticket-fields/1/', body: { is_active: false } });
    expect(f.active).toBe(false);
    await realFields.updateField('1', { title: 'Novo', required: true, description: 'd' });
    expect(writes()[1]!.body).toEqual({ title: 'Novo', is_required: true, description: 'd' });
  });

  it('reordena com {ids} numéricos e devolve a lista inteira', async () => {
    handler = (c) => (c.path.endsWith('/reorder/') ? ok([...fieldsFx.results].reverse()) : undefined);
    const list = await realFields.reorderFields(['3', '1', '2']);
    expect(writes()[0]).toMatchObject({ path: '/settings/ticket-fields/reorder/', body: { ids: [3, 1, 2] } });
    expect(list[0]!.slug).toBe('ag_front_obs');
  });

  it('409 field_in_use ao apagar campo usado (com o código para a tela sugerir desativar)', async () => {
    handler = (c) => (c.method === 'DELETE' ? { status: 409, body: { detail: 'Este campo já foi usado em tickets e não pode ser apagado. Desative-o para escondê-lo.', code: 'field_in_use' } } : undefined);
    const err = await realFields.deleteField('1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'field_in_use' });
    expect(err.message).toMatch(/Desative-o/);
  });

  it('400: erro de validação por campo (options, type) e 404', async () => {
    handler = () => ({ status: 400, body: { options: ['Informe ao menos uma opção para a lista.'], type: ['Este campo já tem valores em tickets: o tipo não pode mudar.'] } });
    const err = await realFields.updateField('1', { type: 'number' }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.fieldErrors).toEqual({ options: ['Informe ao menos uma opção para a lista.'], type: ['Este campo já tem valores em tickets: o tipo não pode mudar.'] });
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    expect(await realFields.updateField('99', { title: 'x' }).catch((e) => e)).toMatchObject({ status: 404 });
  });

  it('403 sem settings.manage vira a frase padrão de permissão', async () => {
    handler = () => ({ status: 403, body: { detail: 'Você não tem permissão para executar esta ação.' } });
    const err = await realFields.createField({ title: 'x', type: 'text' }).catch((e) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(err.message).toMatch(/^Você não tem permissão para esta ação\./);
  });
});

describe('api real: formulários (/settings/ticket-forms/)', () => {
  it('lista mapeada com padrão, equipe e tipo; cria com form_fields na ordem', async () => {
    handler = (c) => (c.method === 'GET' && c.path === '/settings/ticket-forms/' ? ok(formsFx) : c.method === 'POST' ? ok(formsFx.results[1], 201) : undefined);
    const list = await realForms.listForms();
    expect(list.map((f) => [f.id, f.isDefault])).toEqual([['1', true], ['2', false]]);
    await realForms.createForm({ name: 'AG-front Incidentes', defaultTeamId: '1', defaultType: 'incident', fields: [{ field: 'ag_front_contrato', required: true }, { field: 'ag_front_obs', required: false }] });
    expect(writes()[0]).toMatchObject({
      path: '/settings/ticket-forms/',
      body: { name: 'AG-front Incidentes', default_team: 1, type: 'incident', form_fields: [{ field: 'ag_front_contrato', is_required: true }, { field: 'ag_front_obs', is_required: false }] },
    });
  });

  it('define o padrão, reordena e clona (com e sem nome)', async () => {
    handler = (c) => (c.path.endsWith('/reorder/') ? ok(formsFx.results) : c.method === 'PATCH' ? ok(formsFx.results[1]) : c.path.endsWith('/clone/') ? ok(formsFx.results[1], 201) : undefined);
    await realForms.updateForm('2', { isDefault: true });
    expect(writes()[0]).toMatchObject({ method: 'PATCH', path: '/settings/ticket-forms/2/', body: { is_default: true } });
    await realForms.reorderForms(['2', '1']);
    expect(writes()[1]).toMatchObject({ path: '/settings/ticket-forms/reorder/', body: { ids: [2, 1] } });
    await realForms.cloneForm('2');
    await realForms.cloneForm('2', ' Cópia boa ');
    expect(writes()[2]).toMatchObject({ path: '/settings/ticket-forms/2/clone/', body: {} });
    expect(writes()[3]!.body).toEqual({ name: 'Cópia boa' });
  });

  it('409 form_in_use e default_form_required; 400 de nome repetido no campo', async () => {
    handler = () => ({ status: 409, body: { detail: 'Há tickets usando este formulário. Desative-o em vez de apagar.', code: 'form_in_use' } });
    expect(await realForms.deleteForm('2').catch((e) => e)).toMatchObject({ status: 409, code: 'form_in_use' });
    handler = () => ({ status: 409, body: { detail: 'Este é o formulário padrão e não pode ser apagado. Escolha outro formulário como padrão antes.', code: 'default_form_required' } });
    expect(await realForms.deleteForm('1').catch((e) => e)).toMatchObject({ status: 409, code: 'default_form_required' });
    expect(await realForms.updateForm('1', { active: false }).catch((e) => e)).toMatchObject({ code: 'default_form_required' });
    handler = () => ({ status: 400, body: { name: ['Já existe um formulário com este nome.'] } });
    expect((await realForms.createForm({ name: 'x' }).catch((e) => e)).fieldErrors).toEqual({ name: ['Já existe um formulário com este nome.'] });
  });

  it('403 e 404', async () => {
    handler = () => ({ status: 403, body: { detail: 'Sem permissão.' } });
    expect((await realForms.createForm({ name: 'x' }).catch((e) => e)).message).toMatch(/permissão para esta ação/);
    handler = () => ({ status: 404, body: { detail: 'Não encontrado.' } });
    expect(await realForms.deleteForm('99').catch((e) => e)).toMatchObject({ status: 404 });
  });
});

describe('api real: custom_fields e form_id no ticket', () => {
  it('salvar propriedades manda custom_fields (null apaga) e form_id no MESMO PATCH, antes da mensagem', async () => {
    handler = (c) => {
      if (c.method === 'PATCH' && c.path === '/tickets/183/') return ok({ ...ticketCf, custom_fields: { ag_front_contrato: 'C-9' }, form_id: 1 });
      if (c.method === 'POST' && c.path === '/tickets/183/reply/') return ok(ticketCf, 201);
      return undefined;
    };
    const t = await realTickets.updateTicket(183, { priority: 'high', fieldValues: { ag_front_contrato: 'C-9', ag_front_valor: null }, formId: '1' }, { authorId: '1', public: false, bodyHtml: '<p>nota</p>' });
    const w = writes();
    expect(w.map((c) => c.path)).toEqual(['/tickets/183/', '/tickets/183/reply/']);
    expect(w[0]!.body).toEqual({ priority: 'high', custom_fields: { ag_front_contrato: 'C-9', ag_front_valor: null }, form_id: 1 });
    expect(t.id).toBe(183);
  });

  it('400 por campo (valor inválido): ApiError com o corpo, nada aplicado; o front lê o erro de cada campo', async () => {
    handler = (c) => (c.method === 'PATCH' ? { status: 400, body: cf400 } : undefined);
    const err = await realTickets.updateTicket(183, { fieldValues: { ag_front_valor: 'abc' as unknown as number } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(PartialUpdateError);
    expect(customFieldErrors(err)).toHaveProperty('ag_front_valor');
  });

  it('fechar com obrigatório pendente: 400 required_custom_fields, mantém code/body mesmo em falha parcial', async () => {
    handler = (c) => {
      if (c.method === 'PATCH') return ok(ticketCf);
      if (c.path === '/tickets/183/close/') return { status: 400, body: requiredFx };
      return undefined;
    };
    const closed = statusesFx.results.find((s) => s.category === 'closed' && s.is_system)!;
    // sozinho: erro puro
    const alone = await realTickets.updateTicket(183, { statusId: String(closed.id) }, undefined, { resolutionWindow: { started: '2026-10-23T15:11:00Z', ended: '2026-10-23T15:12:00Z' } }).catch((e) => e);
    expect(alone).toBeInstanceOf(ApiError);
    expect(requiredFromError(alone)).toEqual([{ id: '1', slug: 'ag_front_contrato', title: 'AG-front Contrato' }]);
    // com propriedades antes: falha parcial, mas o código e os campos continuam acessíveis
    const partial = await realTickets.updateTicket(183, { priority: 'low', statusId: String(closed.id) }, undefined, { resolutionWindow: { started: '2026-10-23T15:11:00Z', ended: '2026-10-23T15:12:00Z' } }).catch((e) => e);
    expect(partial).toBeInstanceOf(PartialUpdateError);
    expect(partial.code).toBe('required_custom_fields');
    expect(requiredFromError(partial)?.[0]?.slug).toBe('ag_front_contrato');
  });

  it('responder fechando com pendência: 400 e a mensagem NÃO foi gravada (o front mantém o texto)', async () => {
    handler = (c) => (c.path === '/tickets/183/reply/' ? { status: 400, body: requiredFx } : undefined);
    const closed = statusesFx.results.find((s) => s.category === 'closed' && s.is_system)!;
    const err = await realTickets.updateTicket(183, { statusId: String(closed.id) }, { authorId: '1', public: true, bodyHtml: '<p>pronto</p>' }, { resolutionWindow: { started: '2026-10-23T15:11:00Z', ended: '2026-10-23T15:12:00Z' } }).catch((e) => e);
    expect(requiredFromError(err)).not.toBeNull();
    expect(writes().map((c) => c.path)).toEqual(['/tickets/183/reply/']);
  });

  it('criar leva form_id e custom_fields no POST; 400 required_custom_fields = ticket não criado', async () => {
    handler = (c) => (c.method === 'POST' && c.path === '/tickets/' ? ok(ticketCf, 201) : undefined);
    await realTickets.createTicket({ subject: 'S', requesterId: '17', bodyHtml: '<p>oi</p>', assigneeGroupId: '1', formId: '2', fieldValues: { ag_front_contrato: 'C-1', ag_front_aceite: false, vazio: '' } });
    const post = writes().find((c) => c.path === '/tickets/')!;
    expect(post.body).toMatchObject({ team_id: 1, form_id: 2, custom_fields: { ag_front_contrato: 'C-1', ag_front_aceite: false } });
    expect((post.body as Json).custom_fields).not.toHaveProperty('vazio');
    handler = (c) => (c.method === 'POST' && c.path === '/tickets/' ? { status: 400, body: { ...requiredFx, detail: 'Preencha os campos obrigatórios antes de criar o ticket: AG-front Contrato.' } } : undefined);
    const err = await realTickets.createTicket({ subject: 'S', requesterId: '17', bodyHtml: '<p>oi</p>', assigneeGroupId: '1', formId: '2', fieldValues: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(requiredFromError(err)).toHaveLength(1);
  });

  it('fechamento em lote: failed[] traz o motivo com os nomes dos campos', async () => {
    handler = (c) => (c.path === '/tickets/bulk-close/' ? ok(bulkRequired) : undefined);
    const closed = statusesFx.results.find((s) => s.category === 'closed' && s.is_system)!;
    const res = await realTickets.bulkUpdate([183], { statusId: String(closed.id), resolutions: [{ id: 183, started: '2026-10-23T15:11:00Z', ended: '2026-10-23T15:12:00Z' }] });
    expect(res.failed).toEqual([{ id: 183, message: expect.stringContaining('AG-front Contrato') }]);
  });
});
