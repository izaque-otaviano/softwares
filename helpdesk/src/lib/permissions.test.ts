import { describe, expect, it } from 'vitest';
import { MACRO_WRITE, userCan } from './permissions';

const user = (permissions: string[]) => ({ permissions });

describe('userCan', () => {
  it('modo mock: tudo permitido (não há papéis)', () => {
    expect(userCan(user([]), 'macro.manage', false)).toBe(true);
    expect(userCan(null, 'macro.manage', false)).toBe(true);
  });
  it('modo real: só o que está em me.permissions; sem sessão nada', () => {
    expect(userCan(user(['macro.use']), 'macro.manage', true)).toBe(false);
    expect(userCan(user(['macro.manage']), 'macro.manage', true)).toBe(true);
    expect(userCan(null, 'macro.manage', true)).toBe(false);
  });
  it('lista de alternativas: basta uma (macro.manage OU settings.manage)', () => {
    expect(userCan(user(['settings.manage']), MACRO_WRITE, true)).toBe(true);
    expect(userCan(user(['macro.manage']), MACRO_WRITE, true)).toBe(true);
    expect(userCan(user(['macro.use', 'ticket.view']), MACRO_WRITE, true)).toBe(false);
  });
});
