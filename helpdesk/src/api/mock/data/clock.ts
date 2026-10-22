/** "Agora" fixo calculado ao carregar o módulo: os dados mockados ficam sempre recentes. */
export const MOCK_NOW = new Date();

export const ME_ID = 'me';

/** ISO de `minutes` minutos antes de MOCK_NOW (negativo = futuro). */
export function minutesAgo(minutes: number): string {
  return new Date(MOCK_NOW.getTime() - minutes * 60_000).toISOString();
}
