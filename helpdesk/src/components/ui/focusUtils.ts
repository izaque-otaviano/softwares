/**
 * Auxiliares de foco compartilhados (não fazem parte da API pública do kit).
 *
 * Problema que resolvem: quando o elemento focado SOME do DOM (linha apagada, banner dispensado, toast fechado),
 * o navegador joga o foco para o `<body>` e quem usa teclado ou leitor de tela perde a posição. Os diálogos também
 * não têm para onde devolver o foco quando o gatilho foi desmontado junto com a linha.
 */

/** Marca um contêiner que sobrevive às remoções internas (ex.: a Table) e serve de destino do foco quando o gatilho some. */
export const FOCUS_FALLBACK_ATTR = 'data-focus-fallback';

export function closestFocusFallback(element: Element | null | undefined): HTMLElement | null {
  return element?.closest<HTMLElement>(`[${FOCUS_FALLBACK_ATTR}]`) ?? null;
}

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]',
].join(', ');

function isTabbable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  return element.closest('[hidden], [inert], [aria-hidden="true"]') === null;
}

/** Elementos alcançáveis por Tab, em ordem de documento (aproximação suficiente para escolher um vizinho). */
export function tabbableElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(isTabbable);
}

type FocusTarget = () => HTMLElement | null | undefined;

export interface FocusRescueOptions {
  /** Destinos tentados ANTES dos vizinhos (ex.: o elemento que tinha o foco antes de entrar na região de toasts). */
  prefer?: FocusTarget[];
}

/**
 * Chame ANTES de remover `element` (que contém o foco). Guarda o próximo e o anterior elementos tabuláveis fora dele e
 * devolve `restore()` (ou `null` se o foco não está dentro dele), para chamar DEPOIS que a remoção foi aplicada: se o foco foi
 * parar no `<body>`, leva-o ao primeiro destino disponível — `prefer`, o próximo, o anterior ou o contêiner
 * `data-focus-fallback`. Se o foco já está em outro lugar (o consumidor cuidou dele), não faz nada.
 */
export function captureFocusRescue(element: HTMLElement | null, options: FocusRescueOptions = {}): (() => void) | null {
  // Só há o que resgatar se o foco está dentro do que vai sumir.
  if (!element || !element.contains(document.activeElement)) return null;

  let next: HTMLElement | null = null;
  let previous: HTMLElement | null = null;
  for (const candidate of tabbableElements()) {
    if (element.contains(candidate) || candidate.contains(element)) continue;
    if (element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) next ??= candidate;
    else previous = candidate;
  }
  const fallback = closestFocusFallback(element);

  return () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.isConnected) return;
    const targets: FocusTarget[] = [...(options.prefer ?? []), () => next, () => previous, () => fallback];
    for (const target of targets) {
      const candidate = target();
      if (candidate?.isConnected) {
        candidate.focus();
        if (document.activeElement === candidate) return;
      }
    }
  };
}

/** Elementos que aceitam foco por clique/teclado e, por isso, indicam que o usuário foi para outro controle de propósito. */
const INTERACTIVE = 'button, a[href], input, textarea, select, summary, [contenteditable="true"], [role="button"], [role="tab"], [role="menuitem"], [role="option"]';

/**
 * O foco está "solto"? Verdadeiro no `<body>` ou num contêiner que só recebe foco por script (o diálogo, `<main>`, a região
 * da Table): foi o que sobrou depois de um clique no "nada". Falso quando o usuário clicou ou tabulou até um controle.
 * Serve para decidir se um menu/popover não modal que fechou por clique fora deve devolver o foco ao gatilho
 * (o Radix não devolve nesse caso) sem roubar o foco de quem foi para outro campo.
 */
export function isFocusAdrift(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return true;
  return active.tabIndex < 0 && !active.matches(INTERACTIVE);
}

/**
 * Para `onCloseAutoFocus` de popovers cujo conteúdo move o foco de propósito (ex.: aplicar formatação devolve o foco ao editor):
 * respeita o foco já colocado em um controle e, se ele ficou solto (corpo da página), deixa o Radix devolvê-lo ao gatilho.
 */
export function keepFocusIfPlaced(event: Event): void {
  if (!isFocusAdrift()) event.preventDefault();
}

/** O gatilho de um conteúdo Radix (menu, select, popover), achado pelo `aria-labelledby` do próprio conteúdo. */
export function triggerOfRadixContent(content: EventTarget | null): HTMLElement | null {
  if (!(content instanceof Element)) return null;
  const id = content.getAttribute('aria-labelledby');
  return id ? document.getElementById(id) : null;
}

/**
 * Executa `remove` (que desmonta `element`) sem deixar o foco cair no `<body>`: resgata o foco depois que o React aplicou
 * a remoção. Não agenda nada quando o foco não estava dentro do elemento.
 */
export function removeKeepingFocus(element: HTMLElement | null, remove: () => void, options: FocusRescueOptions = {}): void {
  const restore = captureFocusRescue(element, options);
  remove();
  if (restore) window.setTimeout(restore, 0);
}
