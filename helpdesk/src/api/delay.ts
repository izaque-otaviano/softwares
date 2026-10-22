const isTest = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test';

export interface ApiConfig {
  /** Atraso aleatório em ms (min..max). */
  delayMin: number;
  delayMax: number;
  /** Probabilidade de falha simulada (0..1). */
  failRate: number;
}

/** Em testes (MODE=test) o padrão é sem atraso e sem falhas. */
export const apiConfig: ApiConfig = isTest
  ? { delayMin: 0, delayMax: 0, failRate: 0 }
  : { delayMin: 300, delayMax: 700, failRate: 0.05 };

export function configureApi(patch: Partial<ApiConfig>): void {
  Object.assign(apiConfig, patch);
}

export class ApiError extends Error {
  constructor(message = 'Não foi possível concluir a operação. Tente novamente.') {
    super(message);
    this.name = 'ApiError';
  }
}

export function delay(): Promise<void> {
  const { delayMin, delayMax } = apiConfig;
  const ms = delayMax <= 0 ? 0 : delayMin + Math.random() * (delayMax - delayMin);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lança ApiError com a probabilidade `failRate`. Não use na leitura inicial de contadores. */
export function maybeFail(): void {
  if (apiConfig.failRate > 0 && Math.random() < apiConfig.failRate) throw new ApiError();
}

/** Atraso + falha simulada + execução. `critical: true` nunca falha. */
export async function simulate<T>(fn: () => T, opts: { critical?: boolean } = {}): Promise<T> {
  await delay();
  if (!opts.critical) maybeFail();
  return fn();
}
