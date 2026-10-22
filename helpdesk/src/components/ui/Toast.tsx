import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactElement, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { useUi, type ToastItem, type ToastTone } from '@/store/useUi';
import { removeKeepingFocus, tabbableElements } from './focusUtils';

/** Quantos toasts aparecem ao mesmo tempo. A store já corta em 4; o viewport garante o limite. */
const MAX_VISIBLE = 4;
/** ms até fechar sozinho quando o toast não define `duration` (brief §5.3: 4 s). */
const DEFAULT_DURATION = 4000;
/** Erros ficam até o usuário fechar (WCAG 2.2.1): quem lê devagar ou usa só o teclado não perde a mensagem. */
const ERROR_DURATION = 0;

const TONE: Record<ToastTone, { icon: ReactElement; text: string; stripe: string }> = {
  success: { icon: <CircleCheck aria-hidden className="h-4 w-4" />, text: 'text-sla-text', stripe: 'bg-sla-text' },
  error: { icon: <CircleAlert aria-hidden className="h-4 w-4" />, text: 'text-danger', stripe: 'bg-danger' },
  info: { icon: <Info aria-hidden className="h-4 w-4" />, text: 'text-action', stripe: 'bg-action' },
};

/**
 * Fecha o toast depois de `duration` ms. O tempo restante é preservado quando `paused` liga (mouse ou foco em
 * cima do toast) e o timer é sempre limpo ao desmontar. `duration <= 0` = fica até o usuário fechar.
 */
function useAutoDismiss(duration: number, paused: boolean, onExpire: () => void): void {
  const remaining = useRef(duration);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    if (duration <= 0 || paused) return undefined;
    const startedAt = Date.now();
    const id = window.setTimeout(() => expire.current(), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [duration, paused]);
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  /** Elemento que tinha o foco antes de F8 levá-lo ao toast: para onde o foco volta quando o toast fecha. */
  returnFocus: RefObject<HTMLElement | null>;
}

function ToastCard({ toast, onDismiss, returnFocus }: ToastCardProps) {
  const { id, tone, title, description, action } = toast;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tones = TONE[tone];

  useAutoDismiss(toast.duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION), hovered || focused, () => onDismiss(id));

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  // Fechar com o foco dentro do cartão o desmonta: devolve o foco a quem o tinha antes (F8) em vez de largá-lo no <body>.
  const dismiss = () => removeKeepingFocus(cardRef.current, () => onDismiss(id), { prefer: [() => returnFocus.current] });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismiss();
    }
  };

  return (
    <div
      ref={cardRef}
      role={tone === 'error' ? 'alert' : undefined}
      data-tone={tone}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="anim-pop-in pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded border border-line bg-surface py-3 pl-4 pr-2 shadow-pop"
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tones.stripe)} />
      <span className={cn('mt-px shrink-0', tones.text)}>{tones.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        {action ? (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              dismiss();
            }}
            className="-ml-2 mt-1 inline-flex h-6 items-center rounded px-2 text-xs font-semibold text-action outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Fechar notificação"
        onClick={dismiss}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-muted outline-none transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:shadow-focus"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

export type ToastViewportProps = Record<string, never>;

/**
 * Renderize uma vez na raiz do app. Lê os toasts de `useUi` (dispare com `toast.success/error/info`).
 * A região `aria-live="polite"` fica sempre no DOM para que as inclusões sejam anunciadas; erros usam `role="alert"`.
 * Canto superior direito (abaixo da topbar, para não cobrir a BottomBar nem as ações da página), no máximo 4 visíveis,
 * auto-dispensa em 4 s com pausa em hover/foco; erros ficam até serem fechados.
 * Teclado: F8 leva o foco ao primeiro toast (a região é o último elemento do DOM), Esc fecha o toast focado e o foco
 * volta para onde estava. Com um Modal/Drawer aberto o foco preso do diálogo impede o F8: por isso erros não somem sozinhos.
 */
export function ToastViewport() {
  const toasts = useUi((s) => s.toasts);
  const dismissToast = useUi((s) => s.dismissToast);
  const viewportRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Quem tinha o foco antes de ele entrar na região (por F8 ou Tab): para lá o foco volta quando o toast fecha.
  const rememberReturnFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    returnFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'F8' || event.defaultPrevented) return;
      const viewport = viewportRef.current;
      const first = viewport ? tabbableElements(viewport)[0] : undefined;
      if (!viewport || !first) return;
      event.preventDefault();
      first.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      ref={viewportRef}
      data-toast-viewport=""
      role="region"
      aria-label="Notificações"
      aria-keyshortcuts="F8"
      aria-live="polite"
      onFocus={rememberReturnFocus}
      className="pointer-events-none fixed left-4 right-4 top-topbar z-[80] mt-4 flex flex-col gap-2 sm:left-auto sm:w-96"
    >
      {toasts.slice(-MAX_VISIBLE).map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={dismissToast} returnFocus={returnFocus} />
      ))}
    </div>
  );
}
