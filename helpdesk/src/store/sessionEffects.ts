import { resetLocalLayers } from '@/api/real/local';
import { resetRealCache } from '@/api/real/refs';
import { resetDirectoryCache } from '@/components/lists/useDirectory';
import { resetTicketLookups } from '@/components/ticket/useTicketLookups';
import { useFormStore } from '@/components/ticket/formStore';
import { resetRefData } from './useRefData';
import { useSession } from './useSession';
import { useTabs } from './useTabs';
import { useTickets } from './useTickets';

/** Limpa tudo o que é dado do usuário anterior (tickets, abas, rascunhos, caches). */
export function resetAppState(): void {
  useTickets.setState({ tickets: [], statuses: [], counts: {}, loaded: false, loading: false, error: null, viewIds: {}, viewMeta: {} });
  useTabs.setState({ tabs: [], activeTabId: null, recent: [] });
  useFormStore.setState({ forms: {} });
  resetRefData();
  resetRealCache();
  resetLocalLayers();
  resetDirectoryCache();
  resetTicketLookups();
}

let started = false;

/** Ao sair da sessão (logout ou 401), zera o estado em memória. Chame uma vez no boot. */
export function startSessionEffects(): void {
  if (started) return;
  started = true;
  useSession.subscribe((state, prev) => {
    if (prev.status === 'authenticated' && state.status !== 'authenticated') resetAppState();
  });
}
