import { X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type PillTone = 'neutral' | 'action' | 'danger' | 'note' | 'ai';

export interface PillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: PillTone;
  /** Ícone à esquerda (decorativo). */
  icon?: ReactNode;
  /** Quando definido, mostra um botão de remover dentro da pílula. */
  onRemove?: () => void;
  /** Nome acessível do botão de remover. Padrão: "Remover". Prefira algo específico: "Remover tag vip". */
  removeLabel?: string;
  children: ReactNode;
}

/** Pares com contraste AA. `ai` usa fundo roxo a 10% e texto `fg` (o roxo puro sobre branco dá 4,46:1). */
const TONE: Record<PillTone, string> = {
  neutral: 'border-transparent bg-surface-2 text-fg',
  action: 'border-transparent bg-action-soft text-action-hover',
  danger: 'border-transparent bg-sla-breach text-sla-breachText',
  note: 'border-note-badge bg-note-bg text-note-badgeText',
  ai: 'border-ai bg-ai/10 text-fg',
};

/** Pílula 12px com raio total, 24px de altura. O botão de remover ocupa 24 x 24 (sobrepõe a borda de 1px). */
export function Pill({ tone = 'neutral', icon, onRemove, removeLabel = 'Remover', className, children, ...rest }: PillProps) {
  return (
    <span
      {...rest}
      data-tone={tone}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-pill border pl-2.5 text-xs',
        onRemove ? 'pr-0' : 'pr-2.5',
        TONE[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-my-px -mr-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
        >
          <X aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
