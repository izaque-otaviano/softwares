import { IS_REAL } from './mode';
import { realCapabilities } from './real/capabilities';

/** 'real' = vai ao backend Resolv; 'local' = roda no navegador, em memória (mock/híbrido). */
export type Capability = 'real' | 'local';

export const CAPABILITY_KEYS = [
  // Recursos com módulo em src/api
  'auth',
  'tickets',
  'views',
  'statuses',
  'groups',
  'users',
  'orgs',
  'macros',
  'search',
  'members',
  // Escritas (criar/editar/desativar/enviar resposta/mudar status...): no modo real vão ao backend (etapas 3 e 4).
  // Os campos soltos que o backend não tem (ver as chaves 'local' abaixo) seguem só neste navegador.
  'writes',
  // Sem equivalente no backend (pendentes)
  'triggers',
  'customFields',
  'forms',
  'aiSummary',
  'merge',
  'deleteTicket',
  'ticketType',
  'ccFollowers',
  'licenses',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

const ALL_LOCAL = Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, 'local'])) as Record<CapabilityKey, Capability>;

/** Consulte `capabilities.triggers` etc. No modo mock tudo é 'local'. As telas continuam todas visíveis. */
export const capabilities: Readonly<Record<CapabilityKey, Capability>> = IS_REAL ? realCapabilities : ALL_LOCAL;

export const isRealCapability = (key: CapabilityKey): boolean => capabilities[key] === 'real';

/** Chaves ainda locais (pendentes no backend). */
export const pendingCapabilities = (): CapabilityKey[] => CAPABILITY_KEYS.filter((k) => capabilities[k] === 'local');

/**
 * Texto de ressalva para um recurso que o backend não tem ('local' no modo real); `undefined` no mock e no que vai
 * ao backend. As telas o usam em dicas e faixas: a ressalva aparece SÓ onde o dado fica neste navegador.
 */
export const localHint = (key: CapabilityKey, what?: string): string | undefined =>
  IS_REAL && capabilities[key] === 'local' ? (what ?? 'Somente neste navegador: o backend ainda não tem este recurso.') : undefined;
