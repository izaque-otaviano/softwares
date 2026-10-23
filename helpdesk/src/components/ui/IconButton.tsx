import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip, TooltipProvider } from './Tooltip';

export type IconButtonVariant = 'ghost' | 'outline' | 'ink';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Obrigatório: vira o `aria-label` e o conteúdo do Tooltip. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  /** sm = 24px, md = 32px. */
  size?: IconButtonSize;
  /** Atalho exibido no Tooltip, ex.: "g h". */
  shortcut?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Quando definido, o botão vira um alternador (`aria-pressed`). */
  pressed?: boolean;
}

const SIZE: Record<IconButtonSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
};

/*
 * Fundo e cor do texto por estado. `cn` não faz tailwind-merge: duas utilities da mesma propriedade (bg-*, text-*) no mesmo
 * elemento disputam pela ordem do CSS gerado, e a "de repouso" vencia a "pressionada". Por isso o repouso e o pressionado
 * são conjuntos EXCLUSIVOS (nunca emitidos juntos), cada um já com o seu hover.
 */
const REST: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-fg-muted data-[state=open]:bg-surface-2',
  outline: 'bg-surface text-fg data-[state=open]:bg-surface-2',
  ink: 'bg-ink text-fg-inverse',
};

const REST_HOVER: Record<IconButtonVariant, string> = {
  ghost: 'hover:bg-hover hover:text-fg',
  outline: 'hover:bg-hover',
  ink: 'hover:bg-ink-hover',
};

const PRESSED: Record<IconButtonVariant, string> = {
  ghost: 'bg-surface-2 text-fg',
  outline: 'bg-surface-2 text-fg',
  ink: 'bg-ink-active text-fg-inverse',
};

const BORDER: Record<IconButtonVariant, string> = {
  ghost: 'border-transparent',
  outline: 'border-line-strong',
  ink: 'border-transparent',
};

/**
 * Botão só com ícone. O Tooltip é obrigatório (mesmo texto do `aria-label`).
 * Traz o próprio `TooltipProvider`, então funciona isolado (testes, Storybook) e dentro do provider global.
 * Repassa ref e atributos nativos ao `<button>`, por isso serve de filho de `asChild` em gatilhos do Radix.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', shortcut, tooltipSide, pressed, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <TooltipProvider>
      <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
        <button
          {...rest}
          ref={ref}
          type={type}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            'inline-flex shrink-0 select-none items-center justify-center rounded border outline-none transition-colors duration-100 focus-visible:shadow-focus',
            SIZE[size],
            BORDER[variant],
            pressed ? PRESSED[variant] : [REST[variant], !disabled && REST_HOVER[variant]],
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          <span aria-hidden className="inline-flex [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        </button>
      </Tooltip>
    </TooltipProvider>
  );
});
