/** Notificação com `url` interna (caminho do app) pode ser aberta; qualquer outra coisa não vira link. */
export const internalPath = (url: string): string | undefined => (url.startsWith('/') && !url.startsWith('//') ? url : undefined);
