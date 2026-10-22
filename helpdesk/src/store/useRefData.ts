import { create } from 'zustand';
import { metaApi, orgsApi, triggersApi, usersApi } from '@/api';
import type { Group, Org, TicketStatus, Trigger, User } from '@/types/domain';

/**
 * Cache SÍNCRONO de dados de referência (usuários, organizações, grupos, status, gatilhos) para stores e
 * funções puras que não podem esperar uma chamada de API (formStore, motor de gatilhos).
 * Alimentado só pela camada de API: nada aqui conhece o mock.
 */
interface RefState {
  users: User[];
  orgs: Org[];
  groups: Group[];
  statuses: TicketStatus[];
  triggers: Trigger[];
  loaded: boolean;
  /** Recarrega tudo. Nunca lança: em falha mantém o que já tinha. */
  refresh: () => Promise<void>;
  /** Carrega uma vez (não repete se já carregou). */
  ensure: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useRefData = create<RefState>()((set, get) => ({
  users: [],
  orgs: [],
  groups: [],
  statuses: [],
  triggers: [],
  loaded: false,

  refresh: () => {
    const run = (async () => {
      const [users, orgs, groups, statuses, triggers] = await Promise.all([
        usersApi.listUsers().catch(() => null),
        orgsApi.listOrgs().catch(() => null),
        metaApi.listGroups().catch(() => null),
        metaApi.listStatuses().catch(() => null),
        triggersApi.listTriggers().catch(() => null),
      ]);
      const cur = get();
      set({
        users: users ?? cur.users,
        orgs: orgs ?? cur.orgs,
        groups: groups ?? cur.groups,
        statuses: statuses ?? cur.statuses,
        triggers: triggers ?? cur.triggers,
        loaded: Boolean(users && orgs && groups && statuses) || cur.loaded,
      });
    })().finally(() => {
      if (inflight === run) inflight = null;
    });
    inflight = run;
    return run;
  },

  ensure: () => (get().loaded ? Promise.resolve() : (inflight ?? get().refresh())),
}));

export const resetRefData = (): void => useRefData.setState({ users: [], orgs: [], groups: [], statuses: [], triggers: [], loaded: false });
