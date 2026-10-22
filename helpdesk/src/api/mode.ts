/** Modo da camada de API: 'mock' (padrão; testes e demonstração) ou 'real' (backend Resolv). */
export type ApiMode = 'mock' | 'real';

export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'mock';
export const IS_REAL: boolean = API_MODE === 'real';
