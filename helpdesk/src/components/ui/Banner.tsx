import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { removeKeepingFocus } from './focusUtils';

export type BannerTone = 'error' | 'warning' | 'info' | 'success';

export interface BannerProps {
  tone: BannerTone;
  title?: string;
  children?: ReactNode;
  /** Mostra o botão de nova tentativa. */
  onRetry?: () => void;
  /** Padrão: "Tentar novamente". */
  retryLabel?: string;
  /** Mostra o botão "Dispensar". */
  onDismiss?: () => void;
  className?: string;
}

interface ToneStyle {
  icon: LucideIcon;
  /** Fundo, texto e borda. Todos os textos têm contraste AA sobre o fundo (Banner.test.tsx). */
  box: string;
  iconColor: string;
}

const TONE: Record<BannerTone, ToneStyle> = {
  error: { icon: AlertCircle, box: 'border-danger/30 bg-sla-breach text-sla-breachText', iconColor: 'text-danger' },
  warning: { icon: AlertTriangle, box: 'border-note-badge bg-note-bg text-note-badgeText', iconColor: 'text-sla-warnText' },
  info: { icon: Info, box: 'border-action/30 bg-action-soft text-action-hover', iconColor: 'text-action' },
  success: { icon: CheckCircle2, box: 'border-sla-text/30 bg-sla-bg text-sla-text', iconColor: 'text-sla-text' },
};

const ACTION_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus';

/**
 * Aviso em linha. `error` usa `role="alert"` (anunciado na hora); os demais usam `role="status"`.
 * Sem gradiente, sem sombra; cores só por tokens.
 * Ao dispensar ou tentar de novo, se o consumidor remover o banner, o foco vai para o próximo elemento tabulável (não se perde no `<body>`).
 */
export function Banner({ tone, title, children, onRetry, retryLabel = 'Tentar novamente', onDismiss, className }: BannerProps) {
  const { icon: Icon, box, iconColor } = TONE[tone];
  const rootRef = useRef<HTMLDivElement>(null);

  // Dispensar e tentar novamente costumam desmontar o banner (e o botão que tem o foco): resgata o foco.
  const withFocusRescue = (callback: () => void) => () => removeKeepingFocus(rootRef.current, callback);

  return (
    <div
      ref={rootRef}
      role={tone === 'error' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn('flex items-start gap-3 rounded border px-3 py-2.5 text-sm', box, className)}
    >
      <Icon aria-hidden className={cn('mt-px h-4 w-4 shrink-0', iconColor)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {onRetry || onDismiss ? (
        <div className="-my-1 flex shrink-0 items-center gap-1">
          {onRetry ? (
            <button type="button" onClick={withFocusRescue(onRetry)} className={cn(ACTION_BUTTON, 'h-8 border border-current px-3 text-sm font-semibold')}>
              {retryLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" aria-label="Dispensar" onClick={withFocusRescue(onDismiss)} className={cn(ACTION_BUTTON, 'h-8 w-8')}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
