import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import { toApiError } from '@/api/real/http';
import { categoryLockReason, isFactory, statusFormErrors } from './statusRules';

describe('statusFormErrors (400 do backend -> campos do formulário)', () => {
  it('nome repetido vai para o campo Nome, com a mensagem do backend', () => {
    const e = toApiError(400, { name: ['Já existe o status "Aberto". Escolha um nome diferente.'] });
    expect(statusFormErrors(e)).toEqual({ fields: { agentName: 'Já existe o status "Aberto". Escolha um nome diferente.', category: undefined, color: undefined }, general: undefined });
  });

  it('troca de categoria com tickets vai para o campo Categoria', () => {
    const msg = '3 chamado(s) usam este status. Crie o status na categoria certa e mova os tickets.';
    expect(statusFormErrors(toApiError(400, { category: [msg] })).fields.category).toBe(msg);
  });

  it('status de fábrica não desativa (is_active) vira mensagem geral', () => {
    const r = statusFormErrors(toApiError(400, { is_active: ['Status de fábrica não pode ser desativado.'] }));
    expect(r.general).toBe('Status de fábrica não pode ser desativado.');
    expect(r.fields).toEqual({ agentName: undefined, category: undefined, color: undefined });
  });

  it('permissão (403), rede e erro desconhecido viram mensagem geral', () => {
    expect(statusFormErrors(toApiError(403, { detail: 'Apenas administradores.' })).general).toMatch(/permissão/);
    expect(statusFormErrors(new ApiError('Sem conexão com o servidor.', { status: 0 })).general).toBe('Sem conexão com o servidor.');
    expect(statusFormErrors(new Error('boom')).general).toBe('boom');
    expect(statusFormErrors('x').general).toBe('Não foi possível salvar. Tente novamente.');
  });

  it('erro de campo E de regra geral: mantém os dois', () => {
    const r = statusFormErrors(toApiError(400, { name: ['Repetido.'], is_active: ['Fábrica.'] }));
    expect(r.fields.agentName).toBe('Repetido.');
    expect(r.general).toBe('Fábrica.');
  });
});

describe('regras que o backend recusa (a UI já explica)', () => {
  it('status de fábrica: não desativa nem muda de categoria', () => {
    expect(isFactory({ id: '2', system: true })).toBe(true);
    expect(isFactory({ id: '9', system: false })).toBe(false);
    expect(isFactory({ id: 'solved' })).toBe(true); // mock: ids de sistema
    expect(categoryLockReason({ id: '2', system: true })).toMatch(/de fábrica/);
  });

  it('status personalizado em uso: categoria travada com a contagem; sem tickets, livre', () => {
    expect(categoryLockReason({ id: '9', system: false, ticketCount: 1 })).toMatch(/^1 ticket usa este status/);
    expect(categoryLockReason({ id: '9', system: false, ticketCount: 4 })).toMatch(/^4 tickets usam este status/);
    expect(categoryLockReason({ id: '9', system: false, ticketCount: 0 })).toBeUndefined();
    expect(categoryLockReason({ id: '9', system: false })).toBeUndefined();
    expect(categoryLockReason(null)).toBeUndefined();
  });
});
