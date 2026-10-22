import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio, contrastWithWhite, parseHex } from './colorContrast';
import { tokenHex } from './testTokens';

describe('colorContrast', () => {
  it('lê hex curto e longo; recusa o resto', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#1F73B7')).toEqual({ r: 31, g: 115, b: 183 });
    expect(parseHex('var(--status-new)')).toBeNull();
    expect(parseHex('rgb(0,0,0)')).toBeNull();
  });

  it('calcula razões conhecidas (preto/branco = 21, igual = 1)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(contrastRatio('#fff', '#000'), 10);
    expect(Number.isNaN(contrastRatio('red', '#fff'))).toBe(true);
  });

  it('texto branco: reprova só status.new entre os status do tema', () => {
    const ratios = Object.fromEntries(
      ['new', 'open', 'hold', 'pending', 'solved'].map((k) => [k, contrastWithWhite(tokenHex(`status.${k}`))]),
    );
    expect(ratios.new).toBeLessThan(AA_NORMAL);
    for (const k of ['open', 'hold', 'pending', 'solved'] as const) expect(ratios[k]).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
