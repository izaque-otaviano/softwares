import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = azul (ações de formulário); ink = escuro (envio/CTA de topo); danger = confirmação destrutiva. */
  variant?: ButtonVariant;
  /** md = 32px, lg = 40px. */
  size?: ButtonSize;
  /** Mostra um spinner, mantém a largura e bloqueia cliques (aria-busy). */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/* -------------------------------------------------------------------------- */
/* Estilos compartilhados (SplitButton reaproveita as cores)                   */
/* -------------------------------------------------------------------------- */

const SURFACE: Record<ButtonVariant, string> = {
  primary: 'bg-action text-fg-inverse',
  ink: 'bg-ink text-fg-inverse',
  outline: 'bg-surface text-fg',
  ghost: 'bg-transparent text-fg',
  danger: 'bg-danger text-fg-inverse',
};

const HOVER: Record<ButtonVariant, string> = {
  primary: 'hover:bg-action-hover',
  ink: 'hover:bg-ink-active',
  outline: 'hover:bg-hover',
  ghost: 'hover:bg-hover',
  danger: 'hover:brightness-90',
};

const BORDER: Record<ButtonVariant, string> = {
  primary: 'border-transparent',
  ink: 'border-transparent',
  outline: 'border-line-strong',
  ghost: 'border-transparent',
  danger: 'border-transparent',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-8 px-3',
  lg: 'h-10 px-4',
};

/** Fundo e texto do botão; o hover só entra quando o botão está interativo (sem disabled/loading). */
export function buttonSurface(variant: ButtonVariant, interactive = true): string {
  return cn(SURFACE[variant], interactive && HOVER[variant]);
}

/** Layout, tipografia, transição e foco comuns a todos os botões sólidos do kit. */
export const BUTTON_BASE =
  'relative inline-flex select-none items-center justify-center whitespace-nowrap text-sm outline-none transition-colors duration-100 focus-visible:shadow-focus';

/* -------------------------------------------------------------------------- */
/* Conteúdo (ícones + spinner sobreposto sem mudar a largura)                  */
/* -------------------------------------------------------------------------- */

const ICON_SLOT = 'inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4';

export interface ButtonContentProps {
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * Conteúdo do botão. Durante `loading` o texto continua no DOM (nome acessível preservado e largura mantida),
 * apenas transparente, e o spinner fica centralizado por cima.
 */
export function ButtonContent({ loading = false, leadingIcon, trailingIcon, children }: ButtonContentProps) {
  return (
    <>
      <span className={cn('inline-flex items-center justify-center gap-1.5', loading && 'opacity-0')}>
        {leadingIcon ? (
          <span aria-hidden className={ICON_SLOT}>
            {leadingIcon}
          </span>
        ) : null}
        {children}
        {trailingIcon ? (
          <span aria-hidden className={ICON_SLOT}>
            {trailingIcon}
          </span>
        ) : null}
      </span>
      {loading ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <Spinner label="" />
        </span>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', loading = false, leadingIcon, trailingIcon, className, children, disabled, type = 'button', onClick, 'aria-disabled': ariaDisabled, ...rest },
  ref,
) {
  const interactive = !disabled && !loading;

  // `loading` não usa o atributo `disabled`: o botão mantém o foco do teclado, mas ignora cliques e envio de formulário.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading ? true : ariaDisabled}
      onClick={handleClick}
      className={cn(
        BUTTON_BASE,
        'rounded border',
        SIZE[size],
        BORDER[variant],
        buttonSurface(variant, interactive),
        disabled && 'cursor-not-allowed opacity-50',
        loading && 'cursor-progress',
        className,
      )}
    >
      <ButtonContent loading={loading} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </button>
  );
});
