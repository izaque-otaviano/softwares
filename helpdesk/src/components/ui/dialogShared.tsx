import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { closestFocusFallback } from './focusUtils';

/** Peças compartilhadas por Drawer e Modal. Não faz parte da API pública do kit. */

/** Atributo que o `ToastViewport` (Toast.tsx) carrega para que diálogos não tratem cliques nele como "clique fora". */
export const TOAST_VIEWPORT_ATTR = 'data-toast-viewport';

/**
 * Use em `onInteractOutside`: um toast aparece por cima do diálogo (ex.: erro ao salvar) e clicar nele
 * não deve fechar o diálogo.
 */
export function ignoreToastInteraction(event: Event): void {
  const target = event.target;
  if (target instanceof Element && target.closest(`[${TOAST_VIEWPORT_ATTR}]`)) event.preventDefault();
}

/** Elemento que deve receber o foco de volta: o ativo, ou o gatilho do menu quando o diálogo foi aberto por um item de menu. */
function resolveReturnTarget(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const menuTriggerId = active.closest('[role="menu"]')?.getAttribute('aria-labelledby');
  const menuTrigger = menuTriggerId ? document.getElementById(menuTriggerId) : null;
  return menuTrigger ?? active;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(', ');

/** Foca o primeiro campo/botão do corpo do diálogo. Devolve `false` se não havia nada focável. */
function focusFirstIn(container: HTMLElement | null): boolean {
  const target = container?.querySelector<HTMLElement>(FOCUSABLE);
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

export interface DialogFocus {
  /** Ponha no contêiner do corpo: o foco inicial vai para o primeiro campo dele (e não para o "Fechar" do cabeçalho). */
  bodyRef: RefObject<HTMLDivElement>;
  onOpenAutoFocus: (event: Event) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * Gerência de foco de Drawer e Modal, que são controlados (`open`/`onOpenChange`):
 * - ao abrir: foco no primeiro campo do corpo (ou o que `customOpenAutoFocus` decidir; sem nada focável, o Radix
 *   foca o primeiro elemento do diálogo);
 * - ao fechar: o Radix só devolve o foco sozinho quando existe um `Dialog.Trigger`, então guardamos o elemento
 *   focado no instante em que o diálogo abre e o restauramos ao fechar. Se esse elemento sumiu (a linha do kebab foi
 *   apagada pela própria ação do diálogo), o foco vai para o contêiner `data-focus-fallback` mais próximo dele (a Table),
 *   em vez de se perder no `<body>`.
 */
export function useDialogFocus(open: boolean, customOpenAutoFocus?: (event: Event) => void): DialogFocus {
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const returnFallback = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      returnTo.current = resolveReturnTarget();
      returnFallback.current = closestFocusFallback(returnTo.current);
    }
    wasOpen.current = open;
  }, [open]);

  const onOpenAutoFocus = useCallback(
    (event: Event) => {
      if (customOpenAutoFocus) customOpenAutoFocus(event);
      else if (focusFirstIn(bodyRef.current)) event.preventDefault();
    },
    [customOpenAutoFocus],
  );

  const onCloseAutoFocus = useCallback((event: Event) => {
    const el = returnTo.current;
    const fallback = returnFallback.current;
    returnTo.current = null;
    returnFallback.current = null;
    const target = el?.isConnected ? el : fallback?.isConnected ? fallback : null;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }, []);

  return { bodyRef, onOpenAutoFocus, onCloseAutoFocus };
}

/** Botão "Fechar" (X) do cabeçalho. 32px, sem Tooltip para não abrir sozinho quando recebe o foco inicial. */
export function DialogCloseButton({ className }: { className?: string }) {
  return (
    <RadixDialog.Close asChild>
      <button
        type="button"
        aria-label="Fechar"
        title="Fechar"
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-fg-muted outline-none',
          'transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:shadow-focus',
          className,
        )}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </RadixDialog.Close>
  );
}
