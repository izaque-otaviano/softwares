import { describe, expect, it } from 'vitest';
import { OPTION_ACTIVE_CMDK, OPTION_ACTIVE_RADIX, optionActiveState } from './optionStyles';

describe('optionStyles: destaque do item ativo (barra action de 3px além do fundo hover)', () => {
  it.each([
    ['radix', OPTION_ACTIVE_RADIX, 'data-[highlighted]'],
    ['cmdk', OPTION_ACTIVE_CMDK, 'data-[selected=true]'],
  ])('%s: a barra fica oculta e só aparece no estado ativo, junto do fundo hover', (_name, classes, state) => {
    const list = classes.split(' ');
    expect(list).toContain('before:bg-action');
    expect(list).toContain('before:w-[3px]');
    expect(list).toContain('before:opacity-0');
    expect(list).toContain(`${state}:before:opacity-100`);
    expect(list).toContain(`${state}:bg-hover`);
  });

  it('estado controlado: ativo e inativo emitem opacidades exclusivas (nunca as duas)', () => {
    const on = optionActiveState(true).split(' ');
    const off = optionActiveState(false).split(' ');
    expect(on).toContain('before:opacity-100');
    expect(on).toContain('bg-hover');
    expect(on).not.toContain('before:opacity-0');
    expect(off).toContain('before:opacity-0');
    expect(off).not.toContain('before:opacity-100');
    expect(off).not.toContain('bg-hover');
  });
});
