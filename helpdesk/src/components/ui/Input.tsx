import { forwardRef, useMemo, useRef } from 'react';
import type { InputHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { fieldBoxWithin, mergeRefs } from './fieldUtils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Borda de erro (danger) e `aria-invalid`. O foco mantém o shadow-focus. */
  invalid?: boolean;
  /** Ícone decorativo à esquerda (ex.: `<Search />`). Recebe 16px. */
  leadingIcon?: ReactNode;
  /** Conteúdo à direita dentro do campo (botão de limpar, unidade, atalho...). */
  trailingSlot?: ReactNode;
}

/** Campo de texto de 32px. `className` vai para o contêiner (largura, margens); o resto dos atributos vai para o `<input>`. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leadingIcon, trailingSlot, className, disabled, type = 'text', ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const ref = useMemo(() => mergeRefs(forwardedRef, innerRef), [forwardedRef]);

  // Clicar no padding/ícone do contêiner leva o foco ao input, como em um campo nativo.
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, button, a')) return;
    event.preventDefault();
    innerRef.current?.focus();
  };

  return (
    <div onMouseDown={focusInput} className={cn(fieldBoxWithin({ invalid, disabled }), 'h-8', className)}>
      {leadingIcon ? (
        <span aria-hidden="true" className="pointer-events-none flex shrink-0 items-center pl-2 text-fg-muted [&>svg]:size-4">
          {leadingIcon}
        </span>
      ) : null}
      <input
        {...rest}
        ref={ref}
        type={type}
        disabled={disabled}
        aria-invalid={invalid ? true : rest['aria-invalid']}
        className="h-full min-w-0 flex-1 rounded bg-transparent px-2 text-sm text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-none disabled:cursor-not-allowed disabled:text-fg-subtle"
      />
      {trailingSlot ? <span className="flex shrink-0 items-center pr-1">{trailingSlot}</span> : null}
    </div>
  );
});
