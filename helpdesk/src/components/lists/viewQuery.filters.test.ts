import { describe, expect, it } from 'vitest';
import { serverFiltersToView, viewFiltersToServer, EMPTY_FILTERS } from './viewQuery';

const statuses = [
  { id: '1', category: 'new' },
  { id: '2', category: 'open' },
  { id: '3', category: 'pending' },
  { id: '4', category: 'solved' },
];

describe('viewFiltersToServer', () => {
  it('mapeia prioridade, texto, solicitante, status e período', () => {
    const q = viewFiltersToServer(
      {
        ...EMPTY_FILTERS,
        priority: 'urgent',
        subject: 'cobrança',
        requesterId: '5',
        statusIds: ['3'],
        datePreset: '7d',
      },
      statuses,
    );
    expect(q).toEqual({
      priority: 'urgent',
      q: 'cobrança',
      requester: '5',
      status: 'pending_customer',
      periodo: '7d',
    });
  });

  it('mapeia intervalo de datas', () => {
    const q = viewFiltersToServer(
      { ...EMPTY_FILTERS, datePreset: 'range', from: '2026-01-01', to: '2026-01-31' },
      statuses,
    );
    expect(q).toEqual({ desde: '2026-01-01', ate: '2026-01-31' });
  });
});

describe('serverFiltersToView', () => {
  it('reverte status e período', () => {
    const f = serverFiltersToView({ status: 'pending_customer', periodo: '30d', priority: 'high' }, statuses);
    expect(f.priority).toBe('high');
    expect(f.datePreset).toBe('30d');
    expect(f.statusIds).toEqual(['3']);
  });
});
