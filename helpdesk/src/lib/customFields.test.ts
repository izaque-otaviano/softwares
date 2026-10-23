import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import type { TicketField, TicketForm } from '@/types/domain';
import { cleanValues, customFieldErrors, diffValues, formatFieldValue, formForTicket, isFilled, missingRequired, namesFromRequiredDetail, optionsError, parseNumberInput, requiredError, requiredFromError, sameValues, slotsFor } from './customFields';

const field = (slug: string, over: Partial<TicketField> = {}): TicketField => ({ id: slug, slug, title: slug.toUpperCase(), type: 'text', system: false, active: true, required: false, ...over });
const form = (id: string, items: [string, boolean][], over: Partial<TicketForm> = {}): TicketForm => ({
  id,
  name: `F${id}`,
  description: '',
  active: true,
  isDefault: false,
  order: 0,
  ticketCount: 0,
  fields: items.map(([slug, required]) => ({ fieldId: slug, slug, title: slug.toUpperCase(), type: 'text', fieldActive: true, required })),
  ...over,
});

describe('valores', () => {
  it('vazio é ausente, null ou texto em branco; false e 0 contam como preenchidos', () => {
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled(null)).toBe(false);
    expect(isFilled('  ')).toBe(false);
    expect(isFilled(false)).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(cleanValues({ a: '', b: false, c: 'x', d: null })).toEqual({ b: false, c: 'x' });
  });

  it('diffValues manda só o que mudou e usa null para apagar; chave ausente não mexe', () => {
    expect(diffValues({ a: 'x', b: 1 }, { a: 'x', b: 2, c: true })).toEqual({ b: 2, c: true });
    expect(diffValues({ a: 'x', b: 1 }, { b: 1 })).toEqual({ a: null });
    expect(diffValues({ a: false }, { a: false })).toEqual({});
    expect(sameValues({ a: '' }, {})).toBe(true);
    expect(sameValues({ a: 'x' }, { a: 'y' })).toBe(false);
  });

  it('parseNumberInput aceita vírgula, limita 9 inteiros e 6 decimais', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('12,5')).toBe(12.5);
    expect(parseNumberInput('-3')).toBe(-3);
    expect(parseNumberInput('12abc')).toBeUndefined();
    expect(parseNumberInput('1234567890')).toBeUndefined();
    expect(parseNumberInput('1,1234567')).toBeUndefined();
  });

  it('formatFieldValue: sim/não, rótulo da opção, data brasileira, número', () => {
    expect(formatFieldValue({ type: 'checkbox' }, false)).toBe('Não');
    expect(formatFieldValue({ type: 'dropdown', options: [{ value: 'a', label: 'Alta' }] }, 'a')).toBe('Alta');
    expect(formatFieldValue({ type: 'dropdown', options: [] }, 'removida')).toBe('removida');
    expect(formatFieldValue({ type: 'date' }, '2026-12-31')).toBe('31/12/2026');
    expect(formatFieldValue({ type: 'number' }, 1234.5)).toBe('1.234,5');
    expect(formatFieldValue({ type: 'text' }, undefined)).toBe('—');
  });

  it('optionsError: obrigatória, sem repetidas (sem diferenciar caixa) e com limite', () => {
    expect(optionsError([])).toMatch(/ao menos uma opção/);
    expect(optionsError([{ value: 'a', label: 'A' }, { value: 'b', label: 'a' }])).toMatch(/repetida/);
    expect(optionsError([{ value: 'x', label: 'A' }, { value: 'X', label: 'B' }])).toMatch(/repetida/);
    expect(optionsError([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }])).toBeNull();
  });
});

describe('formulário do ticket e obrigatórios', () => {
  const fields = [field('contrato'), field('sev', { required: true }), field('velho', { active: false }), field('fora')];
  const forms = [form('1', [['contrato', false]], { isDefault: true }), form('2', [['contrato', true], ['sev', false], ['velho', true]])];

  it('formForTicket: o do ticket, senão o padrão', () => {
    expect(formForTicket('2', forms)?.id).toBe('2');
    expect(formForTicket('', forms)?.id).toBe('1');
    expect(formForTicket('999', forms)?.id).toBe('1');
    expect(formForTicket('1', [])).toBeUndefined();
  });

  it('slotsFor mantém a ordem do formulário; obrigatório = no campo OU no formulário; inativo só aparece com valor', () => {
    const slots = slotsFor(forms[1], fields, {});
    expect(slots.map((s) => [s.field.slug, s.required, s.readOnly])).toEqual([
      ['contrato', true, false],
      ['sev', true, false],
    ]);
    const withValue = slotsFor(forms[1], fields, { velho: 'x' });
    expect(withValue.map((s) => [s.field.slug, s.required, s.readOnly])).toContainEqual(['velho', false, true]);
    // campo obrigatório que NÃO está no formulário não é exigido
    expect(slotsFor(forms[0], fields, {}).map((s) => s.field.slug)).toEqual(['contrato']);
  });

  it('missingRequired: checkbox false conta como preenchido; read-only nunca é exigido', () => {
    const slots = slotsFor(forms[1], [field('contrato', { type: 'checkbox' }), field('sev', { required: true })], { contrato: false });
    expect(missingRequired(slots, { contrato: false }).map((s) => s.field.slug)).toEqual(['sev']);
    expect(missingRequired(slots, { contrato: false, sev: 'x' })).toEqual([]);
  });
});

describe('erros do servidor', () => {
  const required = new ApiError('Preencha os campos obrigatórios antes de resolver ou fechar o ticket: Contrato.', {
    status: 400,
    code: 'required_custom_fields',
    body: { detail: 'x', code: 'required_custom_fields', fields: [{ id: 4, slug: 'contrato', title: 'Contrato' }], custom_fields: { contrato: 'Campo obrigatório.' } },
  });

  it('requiredFromError lê fields[] (ou cai em custom_fields) e ignora outros erros', () => {
    expect(requiredFromError(required)).toEqual([{ id: '4', slug: 'contrato', title: 'Contrato' }]);
    expect(requiredFromError(new ApiError('x', { status: 400, code: 'required_custom_fields', body: { custom_fields: { a: 'Campo obrigatório.' } } }))).toEqual([{ slug: 'a', title: 'a' }]);
    expect(requiredFromError(new ApiError('x', { status: 400 }))).toBeNull();
    expect(requiredFromError(new Error('x'))).toBeNull();
  });

  it('customFieldErrors lê o objeto {slug: mensagem}', () => {
    expect(customFieldErrors(new ApiError('x', { status: 400, body: { custom_fields: { valor: 'Informe um número', fantasma: 'inexistente' } } }))).toEqual({ valor: 'Informe um número', fantasma: 'inexistente' });
    expect(customFieldErrors(new ApiError('x', { status: 400, body: { title: ['a'] } }))).toEqual({});
  });

  it('namesFromRequiredDetail separa os nomes do detalhe do failed[]', () => {
    expect(namesFromRequiredDetail('Preencha os campos obrigatórios antes de resolver ou fechar o ticket: Contrato, Severidade.')).toEqual(['Contrato', 'Severidade']);
    expect(namesFromRequiredDetail('Ticket já está fechado.')).toBeNull();
  });

  it('requiredError (mock) tem o mesmo corpo do servidor', () => {
    const e = requiredError([{ id: '1', slug: 'a', title: 'A' }], 'criar');
    expect(e.status).toBe(400);
    expect(e.message).toBe('Preencha os campos obrigatórios antes de criar o ticket: A.');
    expect(requiredFromError(e)).toEqual([{ id: '1', slug: 'a', title: 'A' }]);
  });
});
