/**
 * Marcadores dos textos de macro do backend Resolv: `{{solicitante}}` (primeiro nome do cliente), `{{empresa}}` e
 * `{{referencia}}` (ex.: TD-00012). O backend NÃO os substitui: quem insere o texto na resposta é o front. Marcador
 * desconhecido, ou sem valor (ticket ainda não criado não tem referência), fica visível para o agente resolver.
 */
export function interpolateMacro(text: string, ctx: { requester?: string; company?: string; reference?: string }): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (original, key: string) => {
    if (key === 'solicitante' && ctx.requester) return ctx.requester.trim().split(/\s+/)[0] ?? original;
    if (key === 'empresa' && ctx.company) return ctx.company;
    if (key === 'referencia' && ctx.reference) return ctx.reference;
    return original;
  });
}
