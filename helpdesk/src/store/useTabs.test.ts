import { beforeEach, describe, expect, it } from 'vitest';
import { useTabs } from './useTabs';

beforeEach(() => useTabs.setState({ tabs: [], activeTabId: null, recent: [] }));

describe('useTabs', () => {
  it('abrir o mesmo cliente 2x foca a aba existente', () => {
    const { openTab } = useTabs.getState();
    const a = openTab({ kind: 'user', refId: 'u1', title: 'Carlos Menezes' });
    openTab({ kind: 'ticket', refId: 1, title: 'Ticket 1' });
    const b = openTab({ kind: 'user', refId: 'u1', title: 'Carlos Menezes' });
    expect(a).toBe(b);
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().activeTabId).toBe(a);
  });
  it('mesmo id em tipos diferentes são abas diferentes; new-ticket abre várias', () => {
    const { openTab } = useTabs.getState();
    openTab({ kind: 'user', refId: '1', title: 'U' });
    openTab({ kind: 'org', refId: '1', title: 'O' });
    openTab({ kind: 'new-ticket', title: 'Novo ticket' });
    openTab({ kind: 'new-ticket', title: 'Novo ticket' });
    expect(useTabs.getState().tabs).toHaveLength(4);
  });
  it('requestClose pede confirmação quando suja e closeTab ativa a vizinha', () => {
    const { openTab, setDirty, requestClose, closeTab } = useTabs.getState();
    const a = openTab({ kind: 'ticket', refId: 1, title: 'A' });
    const b = openTab({ kind: 'ticket', refId: 2, title: 'B' });
    setDirty(b, true);
    expect(requestClose(b)).toEqual({ needsConfirm: true });
    expect(useTabs.getState().tabs).toHaveLength(2);
    closeTab(b);
    expect(useTabs.getState().activeTabId).toBe(a);
    expect(requestClose(a)).toEqual({ needsConfirm: false });
    expect(useTabs.getState().tabs).toHaveLength(0);
    expect(useTabs.getState().activeTabId).toBeNull();
  });
  it('registra tickets visualizados recentemente sem duplicar', () => {
    const { openTab } = useTabs.getState();
    openTab({ kind: 'ticket', refId: 1, title: 'A' });
    openTab({ kind: 'ticket', refId: 2, title: 'B' });
    openTab({ kind: 'ticket', refId: 1, title: 'A' });
    expect(useTabs.getState().recent.map((r) => r.ticketId)).toEqual([1, 2]);
  });
});
