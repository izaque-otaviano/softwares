import { describe, expect, it } from 'vitest';
import { IS_REAL } from '@/api/mode';
import { capabilities, pendingCapabilities } from '@/api';
import { getMe, getMeId, useSession } from './useSession';

describe('useSession no modo mock', () => {
  it('nasce autenticado como o agente fixo (login automático, sem tela)', () => {
    expect(IS_REAL).toBe(false);
    const s = useSession.getState();
    expect(s.status).toBe('authenticated');
    expect(getMeId()).toBe('me');
    expect(getMe()).toMatchObject({ id: 'me', name: 'Marina Alves', role: 'agent', teams: ['g1'] });
  });

  it('capabilities: tudo local no mock', () => {
    expect(Object.values(capabilities).every((c) => c === 'local')).toBe(true);
    expect(pendingCapabilities()).toContain('triggers');
  });
});
