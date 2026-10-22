import type { Capability, CapabilityKey } from '../capabilities';

/**
 * Estado no modo REAL. 'real' = leitura E escrita ligadas ao backend (etapas 2 a 4); `writes` = escritas.
 * 'local' = híbrido: funciona no navegador sobre dados em memória e está pendente no backend
 * (ver src/api/PENDENTE_NO_BACKEND.md).
 */
export const realCapabilities: Record<CapabilityKey, Capability> = {
  auth: 'real',
  tickets: 'real',
  views: 'real',
  statuses: 'real',
  groups: 'real',
  users: 'real',
  orgs: 'real',
  macros: 'real',
  search: 'real',
  members: 'real',
  // Etapas 3 e 4: LEITURAS e ESCRITAS (tickets, status, macros, membros, empresas, clientes, etiquetas) vão ao backend.
  writes: 'real',
  // Sem equivalente no backend Resolv: permanecem 'local' (ver PENDENTE_NO_BACKEND.md).
  triggers: 'local',
  customFields: 'local',
  forms: 'local',
  aiSummary: 'local',
  merge: 'local',
  deleteTicket: 'local',
  ticketType: 'local',
  ccFollowers: 'local',
  licenses: 'local',
};
