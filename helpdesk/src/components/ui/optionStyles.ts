/**
 * Destaque do item ativo em listas navegáveis por teclado (Menu, Select, Combobox, sugestões do TagInput).
 *
 * O fundo `hover` (8% de alpha) tem só ~1,1:1 contra o fundo, então sozinho não indica a posição do foco (WCAG 1.4.11 / 2.4.7),
 * e nessas listas o foco é "virtual" ou o anel do item é suprimido. Somamos uma barra de 3px em `action` (5:1 sobre surface)
 * à esquerda do item, a mesma linguagem da linha selecionada da Table.
 */

const BAR =
  'relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xs before:bg-action';

/** Itens do Radix (Menu, Select): a barra fica oculta e `data-highlighted` a revela (variantes de maior especificidade). */
export const OPTION_ACTIVE_RADIX = `${BAR} before:opacity-0 data-[highlighted]:bg-hover data-[highlighted]:before:opacity-100`;

/** Itens do cmdk (Combobox): `data-selected="true"`. */
export const OPTION_ACTIVE_CMDK = `${BAR} before:opacity-0 data-[selected=true]:bg-hover data-[selected=true]:before:opacity-100`;

/** Item ativo controlado pelo React (sugestões do TagInput, `aria-activedescendant`). Um ou outro, nunca os dois juntos. */
export function optionActiveState(active: boolean): string {
  return `${BAR} ${active ? 'bg-hover before:opacity-100' : 'before:opacity-0'}`;
}
