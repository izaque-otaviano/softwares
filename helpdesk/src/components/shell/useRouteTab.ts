import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTabs } from '@/store/useTabs';
import { ensureTab, parseTabRoute } from './openTab';

/** Mantém as abas em sincronia com a URL: abrir uma rota de ticket/cliente/org/busca abre ou foca a aba dela. */
export function useRouteTab(): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const input = parseTabRoute(pathname, search);
    const { tabs, activeTabId, setActive } = useTabs.getState();
    if (!input) {
      if (activeTabId !== null) setActive(null);
      return;
    }
    if (input.kind === 'new-ticket') {
      const active = tabs.find((t) => t.id === activeTabId);
      if (active?.kind === 'new-ticket') return;
    }
    ensureTab(input);
  }, [pathname, search]);
}
