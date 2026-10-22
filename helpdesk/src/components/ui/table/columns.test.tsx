import { describe, expect, it } from 'vitest';
import {
  clampWidth,
  columnLabel,
  DEFAULT_COLUMN_WIDTH,
  insertByDefinitionOrder,
  isErrorConfig,
  isHideable,
  MAX_COLUMN_WIDTH,
  minWidthOf,
  nextSort,
  resolveVisibleIds,
  resolveWidth,
} from './columns';
import type { ColumnDef } from './types';

const col = (id: string, extra: Partial<ColumnDef<unknown>> = {}): ColumnDef<unknown> => ({ id, header: id, cell: () => null, ...extra });

describe('nextSort', () => {
  it('cicla crescente -> decrescente -> nenhuma', () => {
    const first = nextSort(null, 'a');
    expect(first).toEqual({ columnId: 'a', direction: 'asc' });
    const second = nextSort(first, 'a');
    expect(second).toEqual({ columnId: 'a', direction: 'desc' });
    expect(nextSort(second, 'a')).toBeNull();
  });

  it('trocar de coluna recomeça em crescente', () => {
    expect(nextSort({ columnId: 'a', direction: 'desc' }, 'b')).toEqual({ columnId: 'b', direction: 'asc' });
  });
});

describe('largura das colunas', () => {
  it('usa salva > width > padrão', () => {
    expect(resolveWidth(col('a', { width: 200 }), { a: 300 })).toBe(300);
    expect(resolveWidth(col('a', { width: 200 }), {})).toBe(200);
    expect(resolveWidth(col('a'))).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('respeita o mínimo e o máximo', () => {
    const c = col('a', { minWidth: 100 });
    expect(clampWidth(c, 20)).toBe(100);
    expect(clampWidth(c, 5000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampWidth(c, 120.4)).toBe(120);
  });

  it('o mínimo padrão nunca passa da própria width (coluna estreita de ícone)', () => {
    expect(minWidthOf(col('icon', { width: 40 }))).toBe(40);
    expect(minWidthOf(col('wide', { width: 300 }))).toBe(64);
  });

  it('ignora valor salvo inválido', () => {
    expect(resolveWidth(col('a', { width: 200 }), { a: Number.NaN })).toBe(200);
  });
});

describe('colunas visíveis', () => {
  const columns = [col('a'), col('b', { hideable: true }), col('c', { defaultHidden: true }), col('d', { hideable: true })];

  it('sem preferência: tudo, menos defaultHidden', () => {
    expect(resolveVisibleIds(columns)).toEqual(['a', 'b', 'd']);
  });

  it('defaultHidden implica hideable', () => {
    expect(isHideable(columns[2])).toBe(true);
    expect(isHideable(columns[0])).toBe(false);
  });

  it('com preferência: respeita a ordem salva e descarta ids desconhecidos/repetidos', () => {
    expect(resolveVisibleIds(columns, ['d', 'a', 'zzz', 'd', 'c'])).toEqual(['d', 'a', 'c']);
  });

  it('coluna fixa ausente da lista salva volta na posição da definição', () => {
    expect(resolveVisibleIds(columns, ['b', 'd'])).toEqual(['a', 'b', 'd']);
    expect(resolveVisibleIds([col('x'), col('y', { hideable: true }), col('z')], ['y'])).toEqual(['x', 'y', 'z']);
  });

  it('insertByDefinitionOrder coloca a coluna depois da anterior mais próxima já visível', () => {
    expect(insertByDefinitionOrder(columns, ['a', 'd'], 'b')).toEqual(['a', 'b', 'd']);
    expect(insertByDefinitionOrder(columns, ['a', 'b'], 'd')).toEqual(['a', 'b', 'd']);
    expect(insertByDefinitionOrder(columns, ['d'], 'a')).toEqual(['a', 'd']);
    expect(insertByDefinitionOrder(columns, ['a', 'b'], 'b')).toEqual(['a', 'b']);
    expect(insertByDefinitionOrder(columns, ['a'], 'nao-existe')).toEqual(['a']);
  });
});

describe('columnLabel', () => {
  it('prefere label, depois header em texto, depois o id', () => {
    expect(columnLabel(col('a', { label: 'Alfa', header: 'Outro' }))).toBe('Alfa');
    expect(columnLabel(col('a', { header: 'Alfa' }))).toBe('Alfa');
    expect(columnLabel(col('a', { header: <span /> }))).toBe('a');
  });
});

describe('isErrorConfig', () => {
  it('reconhece { message, onRetry } e rejeita ReactNode comuns', () => {
    expect(isErrorConfig({ message: 'x', onRetry: () => {} })).toBe(true);
    expect(isErrorConfig('texto')).toBe(false);
    expect(isErrorConfig(null)).toBe(false);
    expect(isErrorConfig({ message: 'x' })).toBe(false);
    expect(isErrorConfig(<p>oi</p>)).toBe(false);
  });
});
