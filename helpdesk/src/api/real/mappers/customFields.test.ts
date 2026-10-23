import { describe, expect, it } from 'vitest';
import bulkRequired from '../__fixtures__/bulk-close-required.json';
import cf400 from '../__fixtures__/custom-fields-400.json';
import fieldsFx from '../__fixtures__/ticket-fields.json';
import formsFx from '../__fixtures__/ticket-forms.json';
import ticketCf from '../__fixtures__/ticket-custom-detail.json';
import listCf from '../__fixtures__/tickets-cf-filter.json';
import requiredFx from '../__fixtures__/required-custom-fields.json';
import statusesFx from '../__fixtures__/statuses.json';
import { ApiError } from '../../errors';
import { customFieldErrors, namesFromRequiredDetail, requiredFromError } from '@/lib/customFields';
import { toApiError } from '../http';
import { createTicketBody, fieldBody, formBody, mapField, mapForm, mapFieldValues, mapStatus, mapTicketDetail, mapTicketListItem, planNewTicket, planTicketUpdate, toFormData, type TicketDetailDto, type TicketDto } from './index';
import type { TicketFieldDto, TicketFormDto } from './dto';

const statuses = statusesFx.results.map(mapStatus);

describe('campos personalizados: mapeadores com respostas reais do backend', () => {
  it('mapField: id numérico em texto, slug estável, tipo, opções em ordem e contagem de usos', () => {
    const fields = (fieldsFx.results as TicketFieldDto[]).map(mapField);
    expect(fields.map((f) => [f.id, f.slug, f.type])).toEqual([
      ['1', 'ag_front_contrato', 'text'],
      ['2', 'ag_front_severidade', 'dropdown'],
      ['3', 'ag_front_valor', 'number'],
      ['4', 'ag_front_prazo', 'date'],
      ['5', 'ag_front_aceite', 'checkbox'],
      ['6', 'ag_front_obs', 'textarea'],
    ]);
    const contrato = fields[0]!;
    expect(contrato).toMatchObject({ required: true, active: true, system: false, valuesCount: 1, options: undefined });
    expect(fields[1]!.options).toEqual([
      { value: 'alta', label: 'Alta' },
      { value: 'baixa', label: 'Baixa' },
    ]);
    expect(fields[5]!.description).toBe('Observações');
  });

  it('mapForm: equipe e tipo padrão, campos na ordem com obrigatório por formulário', () => {
    const [padrao, form] = (formsFx.results as TicketFormDto[]).map(mapForm);
    expect(padrao).toMatchObject({ id: '1', name: 'Formulário padrão', isDefault: true, fields: [], defaultTeamId: undefined, defaultType: undefined });
    expect(form).toMatchObject({ id: '2', name: 'AG-front Incidentes', isDefault: false, active: true, defaultTeamId: '1', defaultTeamName: 'Suporte', defaultType: 'incident', ticketCount: 1 });
    expect(form!.fields.map((f) => [f.slug, f.type, f.required])).toEqual([
      ['ag_front_contrato', 'text', true],
      ['ag_front_severidade', 'dropdown', false],
      ['ag_front_valor', 'number', false],
      ['ag_front_prazo', 'date', false],
      ['ag_front_aceite', 'checkbox', true],
      ['ag_front_obs', 'textarea', false],
    ]);
  });

  it('detalhe traz custom_fields e form_id; a LISTA traz form_id e NÃO traz valores', () => {
    const detail = mapTicketDetail(ticketCf as unknown as TicketDetailDto, { statuses, staff: [] });
    expect(detail.formId).toBe('2');
    expect(detail.fieldValues).toEqual({ ag_front_contrato: 'C-1', ag_front_severidade: 'alta', ag_front_valor: 12.5, ag_front_prazo: '2026-12-31', ag_front_aceite: false });
    expect(detail.fieldValues!.ag_front_aceite).toBe(false); // false é um valor, não vazio
    const item = mapTicketListItem((listCf.results as unknown as TicketDto[])[0]!, { statuses });
    expect(item.formId).toBe('2');
    expect(item.fieldValues).toBeUndefined();
    expect(item.detailed).toBe(false);
  });

  it('mapFieldValues ignora nulos e vazios', () => {
    expect(mapFieldValues({ a: null, b: '', c: 0, d: false, e: 'x' })).toEqual({ c: 0, d: false, e: 'x' });
    expect(mapFieldValues(undefined)).toEqual({});
  });

  it('400 required_custom_fields real: nomes dos campos e erro por campo', () => {
    const err = toApiError(400, requiredFx);
    expect(err.code).toBe('required_custom_fields');
    expect(requiredFromError(err)).toEqual([{ id: '1', slug: 'ag_front_contrato', title: 'AG-front Contrato' }]);
    expect(err.message).toMatch(/AG-front Contrato/);
  });

  it('400 por campo real: {custom_fields:{slug: msg}} vira erro no campo certo', () => {
    const err = toApiError(400, cf400);
    expect(customFieldErrors(err)).toEqual({ zzz: 'Campo personalizado inexistente.', ag_front_valor: 'Informe um número (até 9 dígitos inteiros e 6 decimais, com ponto).' });
  });

  it('bulk-close real: o detalhe do failed[] traz os nomes dos campos', () => {
    const failed = (bulkRequired as { failed: { id: number; detail: string }[] }).failed[0]!;
    expect(failed.id).toBe(183);
    expect(namesFromRequiredDetail(failed.detail)).toEqual(['AG-front Contrato']);
  });

  it('erros de definição reais chegam por campo (title, options, type)', () => {
    const e = toApiError(400, { options: ['Informe ao menos uma opção para a lista.'] });
    expect(e.fieldErrors).toEqual({ options: ['Informe ao menos uma opção para a lista.'] });
    expect(toApiError(409, { detail: 'x', code: 'field_in_use' }).code).toBe('field_in_use');
    expect(toApiError(409, { detail: 'x', code: 'default_form_required' })).toBeInstanceOf(ApiError);
  });
});

describe('corpos de escrita', () => {
  it('fieldBody: título, opções {value,label}, is_required/is_active', () => {
    expect(fieldBody({ title: ' Contrato ', type: 'dropdown', required: true, options: [{ value: 'a', label: 'A', fresh: true }] })).toEqual({ title: 'Contrato', type: 'dropdown', is_required: true, options: [{ value: 'a', label: 'A' }] });
    expect(fieldBody({ active: false })).toEqual({ is_active: false });
  });

  it('formBody: form_fields na ordem, default_team numérico, null limpa', () => {
    expect(formBody({ name: ' X ', isDefault: true, defaultTeamId: '3', defaultType: 'incident', fields: [{ field: 'a', required: true }, { field: 'b', required: false }] })).toEqual({
      name: 'X',
      is_default: true,
      default_team: 3,
      type: 'incident',
      form_fields: [{ field: 'a', is_required: true }, { field: 'b', is_required: false }],
    });
    expect(formBody({ defaultTeamId: null, defaultType: null })).toEqual({ default_team: null, type: null });
  });

  it('PATCH de propriedades leva custom_fields (null apaga) e form_id (null volta ao padrão) junto das outras', () => {
    const plan = planTicketUpdate({
      patch: { priority: 'high', fieldValues: { a: 'x', b: null }, formId: '5' },
      current: { statusId: 's1', followerIds: [] },
      statuses,
      meId: '1',
      tags: [],
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ kind: 'props', covers: ['priority', 'fieldValues', 'formId'], body: { priority: 'high', custom_fields: { a: 'x', b: null }, form_id: 5 } });
    const clear = planTicketUpdate({ patch: { formId: null }, current: { statusId: 's1', followerIds: [] }, statuses, meId: '1', tags: [] });
    expect(clear.steps[0]!.body).toEqual({ form_id: null });
    // campos de IA continuam locais
    const ai = planTicketUpdate({ patch: { customFields: { topico: 'x' } }, current: { statusId: 's1', followerIds: [] }, statuses, meId: '1', tags: [] });
    expect(ai.steps).toHaveLength(0);
    expect(ai.localKeys).toEqual(['customFields']);
  });

  it('POST de ticket novo leva form_id e custom_fields na mesma chamada; multipart manda o JSON em texto', () => {
    const { body, followUp } = planNewTicket(
      { subject: 'S', requesterId: '7', markdown: 'oi', teamId: 1, formId: '2', fieldValues: { ag_front_contrato: 'C-1', ag_front_aceite: false } },
      { statuses, tags: [] },
    );
    expect(body).toMatchObject({ team_id: 1, form_id: 2, custom_fields: { ag_front_contrato: 'C-1', ag_front_aceite: false } });
    expect(followUp).toEqual({});
    expect(createTicketBody({ subject: 'S', requesterId: '7', markdown: 'x', teamId: 1 })).not.toHaveProperty('custom_fields');
    const fd = toFormData(body, [new File(['a'], 'a.txt')]);
    expect(JSON.parse(String(fd.get('custom_fields')))).toEqual({ ag_front_contrato: 'C-1', ag_front_aceite: false });
    expect(fd.get('form_id')).toBe('2');
  });
});
