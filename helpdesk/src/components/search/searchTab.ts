import { useTabs } from '@/store/useTabs';

/** Troca o termo da aba "Pesquisar" existente (id, título e refId), sem abrir uma segunda aba. */
export function renameSearchTab(oldTerm: string, newTerm: string): void {
  const oldId = `search:${oldTerm}`;
  const newId = `search:${newTerm}`;
  if (oldId === newId) return;
  useTabs.setState((s) => {
    const mine = s.tabs.find((t) => t.id === oldId);
    if (!mine) return s;
    if (s.tabs.some((t) => t.id === newId)) {
      // Já existe uma aba com esse termo: fecha esta e foca a existente.
      return { tabs: s.tabs.filter((t) => t.id !== oldId), activeTabId: newId };
    }
    return {
      tabs: s.tabs.map((t) => (t.id === oldId ? { ...t, id: newId, refId: newTerm, title: `Pesquisar ${newTerm}` } : t)),
      activeTabId: s.activeTabId === oldId ? newId : s.activeTabId,
    };
  });
}
