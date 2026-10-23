/** Minúsculas, sem acentos e sem espaços repetidos (busca e comparação de nomes digitados). */
export function normName(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
